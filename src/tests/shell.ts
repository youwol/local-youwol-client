import { Observable } from 'rxjs'
import { map, mergeMap } from 'rxjs/operators'
import {
    expectAttributes,
    HTTPError,
    HTTPResponse$,
    raiseHTTPErrors,
    Shell as ShellBase,
    ShellWrapperOptions,
    wrap,
} from '@youwol/http-primitives'
import {
    AssetsBackend,
    AssetsGateway,
    FilesBackend,
    ExplorerBackend,
    FluxBackend,
    StoriesBackend,
} from '@youwol/http-clients'

import { PyYouwolClient } from '../lib'
import { readFileSync } from 'fs'
import { UploadAssetResponse } from '../lib/routers/environment'

export class Shell<T> extends ShellBase<T> {
    public readonly assetsGtw: AssetsGateway.Client
    public readonly homeFolderId: string
    public readonly defaultDriveId: string
    public readonly privateGroupId: string
}

export function shell$<T>(context?: T) {
    const assetsGtw = new AssetsGateway.Client()
    return assetsGtw.explorer.getDefaultUserDrive$().pipe(
        raiseHTTPErrors(),
        map((resp: ExplorerBackend.GetDefaultDriveResponse) => {
            expect(resp.driveName).toBe('Default drive')
            return new Shell<T>({
                homeFolderId: resp.homeFolderId,
                defaultDriveId: resp.driveId,
                privateGroupId: resp.groupId,
                assetsGtw,
                context,
            })
        }),
    )
}

export function newShell<TContext, TResp>(
    shell: Shell<TContext>,
    resp: TResp,
    newContext?: (s: Shell<TContext>, r: TResp) => TContext,
) {
    return newContext
        ? new Shell({ ...shell, context: newContext(shell, resp) })
        : shell
}

export function uploadAsset<TContext>({
    inputs,
    newContext,
    authorizedErrors,
    sideEffects,
}: {
    inputs: (shell: Shell<TContext>) => {
        assetId: string
    }
    authorizedErrors?: (resp: HTTPError) => boolean
    sideEffects?: (resp, shell: Shell<TContext>) => void
    newContext?: (shell: Shell<TContext>, resp: UploadAssetResponse) => TContext
}) {
    return wrap<Shell<TContext>, UploadAssetResponse>({
        observable: (shell: Shell<TContext>) =>
            new PyYouwolClient().admin.environment.uploadAsset$(inputs(shell)),
        authorizedErrors,
        sideEffects: (resp, shell) => {
            sideEffects && sideEffects(resp, shell)
        },
        newShell: (shell, resp) => newShell(shell, resp, newContext),
    })
}

export function switchToRemoteShell<TContext>() {
    return (source$: Observable<Shell<TContext>>) => {
        return source$.pipe(
            mergeMap((shell) => {
                return new PyYouwolClient().authorization
                    .getAccessToken$()
                    .pipe(
                        raiseHTTPErrors(),
                        map(({ accessToken }) => {
                            return new Shell({
                                ...shell,
                                assetsGtw:
                                    new AssetsGateway.AssetsGatewayClient({
                                        hostName:
                                            'http://localhost:2001/admin/remote', // Should be dynamic, from py-youwol env
                                        headers: {
                                            authorization: `Bearer ${accessToken}`,
                                        },
                                    }),
                                context: { ...shell.context, accessToken },
                            })
                        }),
                    )
            }),
        )
    }
}

export function upload<TContext>({
    inputs,
    authorizedErrors,
    newContext,
    sideEffects,
}: {
    inputs: (shell: Shell<TContext>) => {
        body: {
            fileId?: string
            fileName: string
            path: string
        }
        queryParameters: { folderId: string }
    }
    authorizedErrors?: (resp: HTTPError) => boolean
    sideEffects?: (resp, shell: Shell<TContext>) => void
    newContext?: (
        shell: Shell<TContext>,
        resp:
            | AssetsGateway.NewAssetResponse<FilesBackend.UploadResponse>
            | FilesBackend.UploadResponse,
    ) => TContext
}) {
    return wrap<
        Shell<TContext>,
        | AssetsGateway.NewAssetResponse<FilesBackend.UploadResponse>
        | FilesBackend.UploadResponse
    >({
        observable: (shell: Shell<TContext>) => {
            const buffer = readFileSync(inputs(shell).body.path)
            const blob = new Blob([Uint8Array.from(buffer).buffer])
            return shell.assetsGtw.files.upload$({
                body: { ...inputs(shell).body, content: blob },
                queryParameters: inputs(shell).queryParameters,
            })
        },
        authorizedErrors,
        sideEffects: (
            resp: AssetsGateway.NewAssetResponse<FilesBackend.UploadResponse>,
            shell,
        ) => {
            expectAttributes(resp.rawResponse, [
                'fileId',
                'fileName',
                'contentType',
                'contentEncoding',
            ])
            sideEffects && sideEffects(resp, shell)
        },
        newShell: (shell, resp) => newShell(shell, resp, newContext),
    })
}

export function queryChildrenExplorer<TContext>(
    inputs: (shell: Shell<TContext>) => {
        parentId: string
    },
    params?: ShellWrapperOptions<
        Shell<TContext>,
        ExplorerBackend.QueryChildrenResponse
    >,
) {
    return wrap({
        observable: (shell) =>
            shell.assetsGtw.explorer.queryChildren$(inputs(shell)),
        ...params,
    })
}

export function getAsset<TContext>(
    inputs: (shell: Shell<TContext>) => {
        assetId: string
    },
    params?: ShellWrapperOptions<
        Shell<TContext>,
        AssetsBackend.GetAssetResponse
    >,
) {
    return wrap<Shell<TContext>, AssetsBackend.GetAssetResponse>({
        observable: (shell: Shell<TContext>) =>
            shell.assetsGtw.assets.getAsset$(inputs(shell)),
        ...params,
    })
}

export function getPermissions<TContext>(
    inputs: (shell: Shell<TContext>) => {
        assetId: string
    },
    params?: ShellWrapperOptions<
        Shell<TContext>,
        AssetsBackend.GetPermissionsResponse
    >,
) {
    return wrap<Shell<TContext>, AssetsBackend.GetPermissionsResponse>({
        observable: (shell: Shell<TContext>) => {
            return shell.assetsGtw.assets.getPermissions$(inputs(shell))
        },
        ...params,
    })
}

export function trashItem<TContext>(
    inputs: (shell: Shell<TContext>) => {
        itemId: string
    },
    params?: ShellWrapperOptions<
        Shell<TContext>,
        ExplorerBackend.TrashItemResponse
    >,
) {
    return wrap<Shell<TContext>, ExplorerBackend.TrashItemResponse>({
        observable: (shell: Shell<TContext>) =>
            shell.assetsGtw.explorer.trashItem$(inputs(shell)),
        ...params,
    })
}

export function purgeDrive<TContext>(
    inputs: (shell: Shell<TContext>) => {
        driveId: string
    },
    params?: ShellWrapperOptions<
        Shell<TContext>,
        ExplorerBackend.PurgeDriveResponse
    >,
) {
    return wrap<Shell<TContext>, ExplorerBackend.PurgeDriveResponse>({
        observable: (shell: Shell<TContext>) =>
            shell.assetsGtw.explorer.purgeDrive$(inputs(shell)),
        ...params,
    })
}

type NewFluxProject =
    AssetsGateway.NewAssetResponse<FluxBackend.NewProjectResponse>

export function newProjectFlux<TContext>(
    inputs: (shell: Shell<TContext>) => {
        queryParameters: { folderId: string }
        body: { name: string }
    },
    params?: ShellWrapperOptions<Shell<TContext>, NewFluxProject>,
) {
    return wrap<Shell<TContext>, NewFluxProject>({
        observable: (shell: Shell<TContext>) =>
            shell.assetsGtw.flux.newProject$(
                inputs(shell),
            ) as HTTPResponse$<NewFluxProject>,
        ...params,
    })
}

export function getProjectFlux<TContext>(
    inputs: (shell: Shell<TContext>) => {
        projectId: string
    },
    params?: ShellWrapperOptions<
        Shell<TContext>,
        FluxBackend.GetProjectResponse
    >,
) {
    return wrap<Shell<TContext>, FluxBackend.GetProjectResponse>({
        observable: (shell: Shell<TContext>) =>
            shell.assetsGtw.flux.getProject$(inputs(shell)),
        ...params,
    })
}

type NewStory =
    AssetsGateway.NewAssetResponse<StoriesBackend.CreateStoryResponse>

export function newStory<TContext>(
    inputs: (shell: Shell<TContext>) => {
        queryParameters: { folderId: string }
        body: { title: string }
    },
    params?: ShellWrapperOptions<Shell<TContext>, NewStory>,
) {
    return wrap<Shell<TContext>, NewStory>({
        observable: (shell: Shell<TContext>) => {
            return shell.assetsGtw.stories.create$(
                inputs(shell),
            ) as HTTPResponse$<NewStory>
        },
        ...params,
    })
}

export function getStory<TContext>(
    inputs: (shell: Shell<TContext>) => {
        storyId: string
    },
    params?: ShellWrapperOptions<
        Shell<TContext>,
        StoriesBackend.GetStoryResponse
    >,
) {
    return wrap<Shell<TContext>, StoriesBackend.GetStoryResponse>({
        observable: (shell: Shell<TContext>) => {
            return shell.assetsGtw.stories.getStory$(inputs(shell))
        },
        ...params,
    })
}

export function getFileInfo<TContext>(
    inputs: (shell: Shell<TContext>) => {
        fileId: string
    },
    params?: ShellWrapperOptions<Shell<TContext>, FilesBackend.GetInfoResponse>,
) {
    return wrap<Shell<TContext>, FilesBackend.GetInfoResponse>({
        observable: (shell: Shell<TContext>) => {
            return shell.assetsGtw.files.getInfo$(inputs(shell))
        },
        ...params,
    })
}
