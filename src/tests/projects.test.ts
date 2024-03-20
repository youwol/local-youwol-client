import { raiseHTTPErrors, expectAttributes } from '@youwol/http-primitives'

import { btoa } from 'buffer'
import {
    combineLatest,
    firstValueFrom,
    Observable,
    of,
    OperatorFunction,
    ReplaySubject,
} from 'rxjs'
import { filter, map, mergeMap, reduce, take, tap } from 'rxjs/operators'
import { PyYouwolClient, Routers } from '../lib'

import {
    expectArtifacts$,
    expectPackageStep,
    expectFlowStatus,
    expectPipelineStepEvents$,
    expectProjectsStatus,
    expectProjectStatus,
    expectPublishLocal,
    uniqueProjectName,
} from './utils'
import { setup$ } from './local-youwol-test-setup'
import { PipelineStepStatusResponse } from '../lib/routers/projects'
import { applyTestCtxLabels, resetTestCtxLabels } from './shell'
import { AssetsGateway } from '@youwol/http-clients'
import * as fs from 'fs'

const pyYouwol = new PyYouwolClient()

/**
 *
 * ⚠️ Warning ⚠️ 'heisenbug'
 *
 * Having a large timeout seems to help having consistent success,
 * not related to the tests themselves but to the beforeAll code (most likely related to git checkout).
 * When beforeAll takes too much time, the tests actually runs before its end,
 * and fails. Eventually, 'beforeAll' finish after the tests failed.
 * The 'beforeAllDone' enables ensuring that 'beforeAll' effectively ran before trying to test anything.
 *
 */
jest.setTimeout(20 * 1000)

let beforeAllDone = false

function assertBeforeAllFinished() {
    if (!beforeAllDone) {
        console.error(
            "projects.test.ts => Test started before 'beforeAll' finished",
        )
        throw Error(
            "projects.test.ts => Test started before 'beforeAll' finished",
        )
    }
}

let newProjectName: string
let privateGroupId: string
const projectTodoAppName = '@youwol/todo-app-js'

/**
 * Beginning with version 0.1.9 of youwol, invoking `GET:projects/status` no longer directly initiates re-indexing of
 * projects. The majority of tests in this file depend on real-time updates captured by the `ProjectsWatcher` thread.
 *
 * The purpose of `waitProjects` is to pause until the watcher detects the anticipated changes.
 *
 * It is recommended to use a replay subject for `projectsStatus$`, which should be set up before any project updates
 * occur. To establish this, employ the `createProjectsStatus$` function at the start of your test.
 */
function waitProjects<T>({
    readyWhen,
    projectsStatus$,
}: {
    readyWhen: (status: Routers.Projects.ProjectsLoadingResults) => boolean
    projectsStatus$: Observable<Routers.Projects.ProjectsLoadingResults>
}): OperatorFunction<T, T> {
    return (obs: Observable<T>) => {
        return obs.pipe(
            mergeMap((d: T) =>
                projectsStatus$.pipe(map((status) => ({ d, status }))),
            ),
            filter(({ status }) => {
                return readyWhen(status)
            }),
            take(1),
            map(({ d }) => d),
        )
    }
}

function createProjectsStatus$() {
    const projectsStatus$ =
        new ReplaySubject<Routers.Projects.ProjectsLoadingResults>()
    pyYouwol.admin.projects.webSocket.status$().subscribe((d) => {
        projectsStatus$.next(d.data)
    })
    return projectsStatus$
}

beforeAll(async () => {
    newProjectName = uniqueProjectName('todo-app-js')

    const projectsStatus$ = createProjectsStatus$()
    const readyWhen = (status: Routers.Projects.ProjectsLoadingResults) => {
        return ['@youwol/todo-app-js', newProjectName].every((name) =>
            status.results.some((r) => r.name === name),
        )
    }

    const beforeAll$ = setup$({
        localOnly: true,
        email: 'int_tests_yw-users@test-user',
    }).pipe(
        mergeMap(() =>
            pyYouwol.admin.customCommands.doPost$({
                name: 'clone-project',
                body: {
                    url: 'https://github.com/youwol/todo-app-js.git',
                    branch: 'main',
                    name: newProjectName,
                },
            }),
        ),
        mergeMap(() =>
            pyYouwol.admin.customCommands.doPost$({
                name: 'clone-project',
                body: {
                    url: 'https://github.com/youwol/todo-app-js.git',
                    branch: 'main',
                    name: projectTodoAppName,
                },
            }),
        ),
        mergeMap(() => {
            return pyYouwol.admin.customCommands.doDelete$({
                name: 'purge-downloads',
            })
        }),
        waitProjects({ readyWhen, projectsStatus$ }),
        mergeMap(() => {
            return new AssetsGateway.Client().accounts.getSessionDetails$()
        }),
        raiseHTTPErrors(),
    )
    const session = await firstValueFrom(beforeAll$)
    beforeAllDone = true
    privateGroupId = session.userInfo.groups.find(
        ({ path }) => path == 'private',
    ).id
})

beforeEach(async () => {
    await firstValueFrom(of(undefined).pipe(applyTestCtxLabels()))
})

afterEach(async () => {
    await firstValueFrom(of(undefined).pipe(resetTestCtxLabels()))
})

test('pyYouwol.admin.projects.status', async () => {
    assertBeforeAllFinished()
    const test$ = combineLatest([
        pyYouwol.admin.projects.status$().pipe(raiseHTTPErrors()),
        pyYouwol.admin.projects.webSocket.status$(),
    ]).pipe(take(1))
    const [respHttp, respWs] = await firstValueFrom(test$)
    expect(respHttp.results).toHaveLength(2)
    expect(respWs.data.results).toHaveLength(2)
    expectProjectsStatus(respHttp, newProjectName)
    expectProjectsStatus(respWs.data, newProjectName)
    expectProjectsStatus(respHttp, projectTodoAppName)
    expectProjectsStatus(respWs.data, projectTodoAppName)
})

test('pyYouwol.admin.projects.projectStatus', async () => {
    assertBeforeAllFinished()
    const projectId = btoa(newProjectName)
    const test$ = combineLatest([
        pyYouwol.admin.projects
            .getProjectStatus$({ projectId })
            .pipe(raiseHTTPErrors()),
        pyYouwol.admin.projects.webSocket.projectStatus$({ projectId }),
    ])

    const [respHttp, respWs] = await firstValueFrom(test$)
    expectProjectStatus(respHttp)
    expectAttributes(respWs.attributes, ['projectId'])
    expect(respWs.data).toEqual(respHttp)
})

test('pyYouwol.admin.projects.flowStatus', async () => {
    assertBeforeAllFinished()
    const test$ = combineLatest([
        pyYouwol.admin.projects
            .getPipelineStatus$({
                projectId: btoa(newProjectName),
                flowId: 'prod',
            })
            .pipe(raiseHTTPErrors()),
        pyYouwol.admin.projects.webSocket.pipelineStatus$(),
    ]).pipe(take(1))

    const [respHttp, respWs] = await firstValueFrom(test$)
    expectFlowStatus(respHttp, newProjectName)
    expectAttributes(respWs.attributes, ['projectId', 'flowId'])
    expect(respHttp).toEqual(respWs.data)
})

function run$(
    projectName: string,
    stepId: string,
    onlySuccess = true,
): Observable<PipelineStepStatusResponse> {
    return combineLatest([
        pyYouwol.admin.projects
            .runStep$({
                projectId: btoa(projectName),
                flowId: 'prod',
                stepId,
            })
            .pipe(raiseHTTPErrors()),
        pyYouwol.admin.projects.webSocket.pipelineStepStatus$({ stepId }).pipe(
            map((d) => d.data),
            filter((message) => {
                return onlySuccess ? message.status === 'OK' : true
            }),
            take(1),
            reduce((acc, e) => [...acc, e], []),
        ),
    ]).pipe(map(([_, respWs]) => respWs.find((step) => step.stepId == stepId)))
}

function checkAsset({
    projectId,
    groupId,
}: {
    projectId: string
    groupId: string
}) {
    return (obs) => {
        return obs.pipe(
            mergeMap(() => {
                const client = new AssetsGateway.Client().assets
                return client.getAsset$({ assetId: btoa(projectId) })
            }),
            raiseHTTPErrors(),
            tap((resp) => {
                expect(resp['groupId']).toBe(groupId)
            }),
            mergeMap(() => {
                const client = new AssetsGateway.Client().explorer
                return client.getItem$({ itemId: btoa(projectId) })
            }),
            raiseHTTPErrors(),
            tap((resp) => {
                expect(resp['groupId']).toBe(groupId)
            }),
        )
    }
}

test('pyYouwol.admin.projects.runStep new project', async () => {
    assertBeforeAllFinished()
    const projectId = btoa(newProjectName)
    const steps$ = expectPipelineStepEvents$(pyYouwol)

    expectArtifacts$(pyYouwol, projectId)
    const runs$ = of(0).pipe(
        mergeMap(() => {
            return run$(newProjectName, 'package')
        }),
        tap((resp) => {
            expectPackageStep(resp)
        }),
        mergeMap(() => {
            return run$(newProjectName, 'cdn-local')
        }),
        tap((resp) => {
            expectPublishLocal(resp, true)
        }),
        mergeMap(() => {
            return expectArtifacts$(pyYouwol, projectId)
        }),
        checkAsset({
            projectId,
            groupId: privateGroupId,
        }),
    )
    const [artifacts, steps] = await firstValueFrom(
        combineLatest([runs$, steps$]),
    )
    expect(artifacts).toBeTruthy()
    expect(steps).toBeTruthy()
})

test('pyYouwol.admin.projects.runStep todo-app-js', async () => {
    assertBeforeAllFinished()
    const projectId = btoa(projectTodoAppName)
    const steps$ = expectPipelineStepEvents$(pyYouwol)

    expectArtifacts$(pyYouwol, projectId)
    const runs$ = of(0).pipe(
        mergeMap(() => {
            return run$(projectTodoAppName, 'package')
        }),
        tap((resp) => {
            expectPackageStep(resp)
        }),
        mergeMap(() => {
            return run$(projectTodoAppName, 'cdn-local', false)
        }),
        tap((resp) => {
            // The publication fails because the test account do not belong to youwol-admin while 'todo-app-js' does.
            // This is expected.
            expectPublishLocal(resp, false)
        }),
        mergeMap(() => {
            return expectArtifacts$(pyYouwol, projectId)
        }),
        checkAsset({
            projectId,
            groupId: btoa('/youwol-users/youwol-devs/youwol-admins'),
        }),
    )
    const [artifacts, steps] = await firstValueFrom(
        combineLatest([runs$, steps$]),
    )
    expect(artifacts).toBeTruthy()
    expect(steps).toBeTruthy()
})

test('pyYouwol.admin.projects.status with errors', async () => {
    const projectsStatus$ = createProjectsStatus$()

    const test$ = pyYouwol.admin.projects.status$().pipe(
        raiseHTTPErrors(),
        map((resp) => {
            const projectName = uniqueProjectName('project-error')
            const projectsPath = resp.results[0].path
                .split('/')
                .slice(0, -1)
                .join('/')
            const projectPath = `${projectsPath}/${projectName}`
            fs.mkdirSync(`${projectPath}/.yw_pipeline/`, {
                recursive: true,
            })
            fs.writeFileSync(
                `${projectPath}/.yw_pipeline/yw_pipeline.py`,
                'import foo',
            )
            return projectPath
        }),
        waitProjects({
            readyWhen: (r) => r.failures.importExceptions.length === 1,
            projectsStatus$,
        }),
        mergeMap((projectsPath) =>
            pyYouwol.admin.projects.status$().pipe(
                raiseHTTPErrors(),
                map((resp) => ({ resp: resp, projectsPath })),
            ),
        ),
        tap(({ resp, projectsPath }) => {
            const importExceptions = resp.failures.importExceptions
            expect(importExceptions).toHaveLength(1)
            expect(importExceptions[0].message).toBe("No module named 'foo'")
            expect(importExceptions[0].path).toBe(projectsPath)
        }),
    )
    await firstValueFrom(test$)
})

test('index projects', async () => {
    const test$ = pyYouwol.admin.projects.status$().pipe(
        raiseHTTPErrors(),
        mergeMap(() => {
            // The following change won't be caught by the ProjectsWatcher thread,
            // the only way to get it (for now) is to perform a re-indexation.
            return new PyYouwolClient().admin.customCommands.doPost$({
                name: 'exec-shell',
                body: {
                    command:
                        "sed -i 's/todo-app-js/todo-app-foo/g' projects/todo-app-js/package.json",
                },
            })
        }),
        mergeMap(() => pyYouwol.admin.projects.index$()),
        raiseHTTPErrors(),
    )
    const r = await firstValueFrom(test$)
    const p = r.results.find((p) => p.name === '@youwol/todo-app-foo')
    expect(p).toBeTruthy()
})
