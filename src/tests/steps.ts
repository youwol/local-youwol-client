import { addBookmarkLog, Shell } from './shell'
import {
    CreateProjectFromTemplateBody,
    CreateProjectFromTemplateResponse,
    GetProjectsStatusResponse,
    PipelineStepStatusResponse,
} from '../lib/routers/projects'
import {
    expectAttributes,
    HTTPError,
    send,
    wrap,
} from '@youwol/http-primitives'
import { run$ } from './utils'
import { GetEnvironmentStatusResponse } from '../lib/routers/environment'
import { InstallBackendEvent } from '../lib/routers/system'
import { merge, Observable, of, ReplaySubject } from 'rxjs'
import { map, mergeMap, reduce, takeWhile, tap } from 'rxjs/operators'

export function newShellFromContext<TContext, TResp>(
    shell: Shell<TContext>,
    resp: TResp,
    newContext?: (s: Shell<TContext>, r: TResp) => TContext,
) {
    return newContext
        ? new Shell({ ...shell, context: newContext(shell, resp) })
        : shell
}

export function getEnvironmentStatus<TContext>({
    authorizedErrors,
    newContext,
    sideEffects,
}: {
    authorizedErrors?: (resp: HTTPError) => boolean
    sideEffects?: (
        resp: GetEnvironmentStatusResponse,
        shell: Shell<TContext>,
    ) => void
    newContext?: (
        shell: Shell<TContext>,
        resp: GetEnvironmentStatusResponse,
    ) => TContext
}) {
    return wrap<Shell<TContext>, GetEnvironmentStatusResponse>({
        observable: (shell: Shell<TContext>) =>
            shell.pyYouwol.admin.environment.getStatus$(),
        authorizedErrors,
        sideEffects: (resp, shell) => {
            expectAttributes(resp, ['youwolEnvironment'])
            expectAttributes(resp.youwolEnvironment, [
                'commands',
                'currentConnection',
                'customMiddlewares',
                'httpPort',
                'pathsBook',
                'proxiedBackends',
                'remotes',
            ])
            sideEffects && sideEffects(resp, shell)
        },
        newShell: (shell, resp) => newShellFromContext(shell, resp, newContext),
    })
}

export function createProject<TContext>({
    inputs,
    authorizedErrors,
    newContext,
    sideEffects,
}: {
    inputs: (shell: Shell<TContext>) => {
        body: CreateProjectFromTemplateBody
    }
    authorizedErrors?: (resp: HTTPError) => boolean
    sideEffects?: (
        resp: CreateProjectFromTemplateResponse,
        shell: Shell<TContext>,
    ) => void
    newContext?: (
        shell: Shell<TContext>,
        resp: CreateProjectFromTemplateResponse,
    ) => TContext
}) {
    return wrap<Shell<TContext>, CreateProjectFromTemplateResponse>({
        observable: (shell: Shell<TContext>) =>
            shell.pyYouwol.admin.projects.createProjectFromTemplate$(
                inputs(shell),
            ),
        authorizedErrors,
        sideEffects: (resp, shell) => {
            expectAttributes(resp, [
                'pipeline',
                'path',
                'name',
                'publishName',
                'id',
                'version',
            ])
            sideEffects && sideEffects(resp, shell)
        },
        newShell: (shell, resp) => newShellFromContext(shell, resp, newContext),
    })
}

export function getProjectsStatus<TContext>({
    authorizedErrors,
    newContext,
    sideEffects,
}: {
    authorizedErrors?: (resp: HTTPError) => boolean
    sideEffects?: (
        resp: GetProjectsStatusResponse,
        shell: Shell<TContext>,
    ) => void
    newContext?: (
        shell: Shell<TContext>,
        resp: GetProjectsStatusResponse,
    ) => TContext
}) {
    return wrap<Shell<TContext>, GetProjectsStatusResponse>({
        observable: (shell: Shell<TContext>) =>
            shell.pyYouwol.admin.projects.status$(),
        authorizedErrors,
        sideEffects: (resp, shell) => {
            expectAttributes(resp, ['results', 'failures'])
            sideEffects && sideEffects(resp, shell)
        },
        newShell: (shell, resp) => newShellFromContext(shell, resp, newContext),
    })
}

export function runStep<TContext>({
    inputs,
    authorizedErrors,
    newContext,
    sideEffects,
}: {
    inputs: (shell: Shell<TContext>) => {
        projectName: string
        stepId: string
    }
    authorizedErrors?: (resp: HTTPError) => boolean
    sideEffects?: (
        resp: PipelineStepStatusResponse,
        shell: Shell<TContext>,
    ) => void
    newContext?: (
        shell: Shell<TContext>,
        resp: PipelineStepStatusResponse,
    ) => TContext
}) {
    return wrap<Shell<TContext>, PipelineStepStatusResponse>({
        observable: (shell: Shell<TContext>) =>
            run$(inputs(shell).projectName, inputs(shell).stepId),
        authorizedErrors,
        sideEffects: (resp, shell) => {
            expectAttributes(resp, [
                'projectId',
                'flowId',
                'stepId',
                'artifactFolder',
                'artifacts',
                'status',
            ])
            sideEffects && sideEffects(resp, shell)
        },
        newShell: (shell, resp) => newShellFromContext(shell, resp, newContext),
    })
}

export function installBackend<TContext>({
    inputs,
    authorizedErrors,
    newContext,
    sideEffects,
}: {
    inputs: (shell: Shell<TContext>) => {
        fromPath: string
    }
    authorizedErrors?: (resp: HTTPError) => boolean
    sideEffects?: (
        resp: { data: InstallBackendEvent },
        shell: Shell<TContext>,
    ) => void
    newContext?: (
        shell: Shell<TContext>,
        resp: { data: InstallBackendEvent },
    ) => TContext
}) {
    const backendEvents$ = new ReplaySubject<{
        data: InstallBackendEvent
    }>()

    return wrap<Shell<TContext>, { data: InstallBackendEvent }>({
        observable: (shell: Shell<TContext>) => {
            return of(shell).pipe(
                tap((shell) => {
                    shell.addSubscription(
                        'backendEvents',
                        merge(
                            shell.pyYouwol.admin.system.webSocket.installBackendEvent$(),
                        ).subscribe((d) => {
                            backendEvents$.next(d)
                        }),
                    )
                }),
                addBookmarkLog({ text: `Start` }),
                addBookmarkLog({
                    text: (shell: Shell<TContext>) =>
                        `Trigger backend install from ${inputs(shell).fromPath}`,
                }),
                send<string, TContext>({
                    inputs: (shell: Shell<TContext>) => {
                        return {
                            commandType: 'query',
                            path: inputs(shell).fromPath,
                        }
                    },
                    sideEffects: (response) => {
                        expect(response).toBeTruthy()
                        expect(
                            response.includes('<div id="swagger-ui">'),
                        ).toBeTruthy()
                    },
                }),
                mergeMap(() => backendEvents$),
                takeWhile((m: { data: InstallBackendEvent }) => {
                    return m.data.event !== 'succeeded'
                }, true),
                reduce((acc, e) => {
                    return [...acc, e]
                }, []),
                tap((events) => {
                    expect(events).toHaveLength(2)
                }),
                map(
                    (events) =>
                        events.slice(-1)[0] as { data: InstallBackendEvent },
                ),
            ) as Observable<{ data: InstallBackendEvent }>
        },
        authorizedErrors,
        sideEffects: (resp, shell) => {
            expectAttributes(resp, [
                'level',
                'attributes',
                'labels',
                'text',
                'data',
                'contextId',
                'parentContextId',
            ])
            expectAttributes(resp.data, [
                'installId',
                'name',
                'version',
                'event',
            ])
            sideEffects && sideEffects(resp, shell)
        },
        newShell: (shell, resp) => newShellFromContext(shell, resp, newContext),
    })
}
