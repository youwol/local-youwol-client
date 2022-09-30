import { Observable } from 'rxjs'
import { map, mergeMap } from 'rxjs/operators'
import {
    HTTPError,
    raiseHTTPErrors,
    AssetsGateway,
    FilesBackend,
    Test,
} from '@youwol/http-clients'
import { PyYouwolClient, UploadAssetResponse } from '../lib'
import { readFileSync } from 'fs'

export function uploadAsset<TContext>({
    inputs,
    newContext,
    authorizedErrors,
    sideEffects,
}: {
    inputs: (shell: Test.Shell<TContext>) => {
        assetId: string
    }
    authorizedErrors?: (resp: HTTPError) => boolean
    sideEffects?: (resp, shell: Test.Shell<TContext>) => void
    newContext?: (
        shell: Test.Shell<TContext>,
        resp: UploadAssetResponse,
    ) => TContext
}) {
    return Test.wrap<Test.Shell<TContext>, UploadAssetResponse, TContext>({
        observable: (shell: Test.Shell<TContext>) =>
            new PyYouwolClient().admin.environment.uploadAsset$(inputs(shell)),
        authorizedErrors,
        sideEffects: (resp, shell) => {
            sideEffects && sideEffects(resp, shell)
        },
        newShell: (shell, resp) =>
            Test.newShellFromContext(shell, resp, newContext),
    })
}

export function switchToRemoteShell<TContext>() {
    return (source$: Observable<Test.Shell<TContext>>) => {
        return source$.pipe(
            mergeMap((shell) => {
                return new PyYouwolClient().authorization
                    .getAccessToken$()
                    .pipe(
                        raiseHTTPErrors(),
                        map(({ accessToken }) => {
                            return new Test.Shell({
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
    inputs: (shell: Test.Shell<TContext>) => {
        body: {
            fileId?: string
            fileName: string
            path: string
        }
        queryParameters: { folderId: string }
    }
    authorizedErrors?: (resp: HTTPError) => boolean
    sideEffects?: (resp, shell: Test.Shell<TContext>) => void
    newContext?: (
        shell: Test.Shell<TContext>,
        resp:
            | AssetsGateway.NewAssetResponse<FilesBackend.UploadResponse>
            | FilesBackend.UploadResponse,
    ) => TContext
}) {
    return Test.wrap<
        Test.Shell<TContext>,
        | AssetsGateway.NewAssetResponse<FilesBackend.UploadResponse>
        | FilesBackend.UploadResponse,
        TContext
    >({
        observable: (shell: Test.Shell<TContext>) => {
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
            Test.expectAssetAttributes(resp)
            Test.expectAttributes(resp.rawResponse, [
                'fileId',
                'fileName',
                'contentType',
                'contentEncoding',
            ])
            sideEffects && sideEffects(resp, shell)
        },
        newShell: (shell, resp) =>
            Test.newShellFromContext(shell, resp, newContext),
    })
}
