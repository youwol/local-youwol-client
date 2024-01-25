import { raiseHTTPErrors, expectAttributes } from '@youwol/http-primitives'

import { btoa } from 'buffer'
import { combineLatest, firstValueFrom, Observable, of } from 'rxjs'
import { filter, map, mergeMap, reduce, take, tap } from 'rxjs/operators'
import { PyYouwolClient } from '../lib'

import {
    expectArtifacts$,
    expectBuildStep,
    expectFlowStatus,
    expectInitStep,
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
beforeAll(async () => {
    newProjectName = uniqueProjectName('todo-app-js')
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
            return run$(newProjectName, 'init')
        }),
        tap((resp) => {
            expectInitStep(resp)
        }),
        mergeMap(() => {
            return run$(newProjectName, 'build')
        }),
        tap((resp) => {
            expectBuildStep(resp)
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
            return run$(projectTodoAppName, 'init')
        }),
        tap((resp) => {
            expectInitStep(resp)
        }),
        mergeMap(() => {
            return run$(projectTodoAppName, 'build')
        }),
        tap((resp) => {
            expectBuildStep(resp)
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
