import {
    AssetsGateway,
    FluxBackend,
    StoriesBackend,
    FilesBackend,
} from '@youwol/http-clients'

import {
    uploadAsset,
    switchToRemoteShell,
    queryChildrenExplorer,
    Shell,
    getAsset,
    trashItem,
    purgeDrive,
    newProjectFlux,
    getProjectFlux,
    newStory,
    getStory,
    upload,
    getFileInfo,
    shell$,
    newShell,
    createAssetWithFiles,
    getAssetZipFiles,
    applyTestCtxLabels,
    resetTestCtxLabels,
} from './shell'
import { firstValueFrom, Observable, of } from 'rxjs'
import path from 'path'
import { setup$ } from './local-youwol-test-setup'
import { NewAssetResponse } from '@youwol/http-clients/src/lib/assets-gateway'

jest.setTimeout(20 * 1000)
beforeAll(async () => {
    await firstValueFrom(
        setup$({
            localOnly: false,
            email: 'int_tests_yw-users@test-user',
        }),
    )
})

beforeEach(async () => {
    await firstValueFrom(of(undefined).pipe(applyTestCtxLabels()))
})

afterEach(async () => {
    await firstValueFrom(of(undefined).pipe(resetTestCtxLabels()))
})

interface UploadContext {
    asset: AssetsGateway.NewAssetResponse<unknown>
}

function uploadTest<TContext extends UploadContext>({
    createOperator,
    getRawOperator,
}) {
    return (source$: Observable<Shell<TContext>>) => {
        return source$.pipe(
            createOperator,
            uploadAsset<TContext>({
                inputs: (shell) => ({
                    assetId: shell.context.asset.assetId,
                }),
            }),
            queryChildrenExplorer<TContext>(
                (shell) => ({
                    parentId: shell.homeFolderId,
                }),
                {
                    sideEffects: (resp, shell) => {
                        const found = resp.items.find(
                            (item) =>
                                item.assetId == shell.context.asset.assetId,
                        )
                        expect(found).toBeTruthy()
                        expect(found['origin'].remote).toBeTruthy()
                        expect(found['origin'].local).toBeTruthy()
                    },
                },
            ),
            switchToRemoteShell(),
            getAsset(
                (shell: Shell<UploadContext>) => ({
                    assetId: shell.context.asset.assetId,
                }),
                {
                    sideEffects: (resp, shell) => {
                        expect(resp.name).toBe(shell.context.asset.name)
                    },
                },
            ),
            getRawOperator,
            trashItem((shell: Shell<UploadContext>) => ({
                itemId: shell.context.asset.itemId,
            })),
            queryChildrenExplorer<TContext>(
                (shell) => ({
                    parentId: shell.homeFolderId,
                }),
                {
                    sideEffects: (resp, shell) => {
                        const found = resp.items.find(
                            (item) =>
                                item.assetId == shell.context.asset.assetId,
                        )
                        expect(found).toBeFalsy()
                    },
                },
            ),
            purgeDrive((shell: Shell<TContext>) => ({
                driveId: shell.defaultDriveId,
            })),
        )
    }
}

test('upload flux project', async () => {
    class Context implements UploadContext {
        public readonly projectName =
            'test-upload-flux-project (auto-generated)'
        asset: AssetsGateway.NewAssetResponse<FluxBackend.NewProjectResponse>

        constructor(
            params: {
                asset?: AssetsGateway.NewAssetResponse<FluxBackend.NewProjectResponse>
            } = {},
        ) {
            Object.assign(this, params)
        }
    }
    const test$ = shell$(new Context()).pipe(
        uploadTest({
            createOperator: newProjectFlux<Context>(
                (shell) => ({
                    queryParameters: { folderId: shell.homeFolderId },
                    body: { name: shell.context.projectName },
                }),
                {
                    newShell: (
                        shell,
                        resp: AssetsGateway.NewAssetResponse<FluxBackend.NewProjectResponse>,
                    ) =>
                        newShell(shell, resp, (shell, resp) => ({
                            ...shell.context,
                            asset: resp,
                        })),
                },
            ),
            getRawOperator: getProjectFlux<Context>(
                (shell) => ({
                    projectId: shell.context.asset.rawId,
                }),
                {
                    sideEffects: (resp) => {
                        expect(resp).toBeTruthy()
                    },
                },
            ),
        }),
    )
    await firstValueFrom(test$)
})

test('upload story', async () => {
    class Context implements UploadContext {
        public readonly storyName = 'test-upload-story (auto-generated)'
        asset: AssetsGateway.NewAssetResponse<StoriesBackend.CreateStoryResponse>

        constructor(
            params: {
                asset?: AssetsGateway.NewAssetResponse<StoriesBackend.CreateStoryResponse>
            } = {},
        ) {
            Object.assign(this, params)
        }
    }
    const test$ = shell$(new Context()).pipe(
        uploadTest({
            createOperator: newStory<Context>(
                (shell) => ({
                    queryParameters: { folderId: shell.homeFolderId },
                    body: { title: shell.context.storyName },
                }),
                {
                    newShell: (shell, resp) =>
                        newShell(shell, resp, (shell, resp) => ({
                            ...shell.context,
                            asset: resp,
                        })),
                },
            ),
            getRawOperator: getStory<Context>(
                (shell) => {
                    return {
                        storyId: shell.context.asset.rawId,
                    }
                },
                {
                    sideEffects: (resp) => {
                        expect(resp).toBeTruthy()
                    },
                },
            ),
        }),
    )

    await firstValueFrom(test$)
})

test('upload data', async () => {
    class Context implements UploadContext {
        public readonly fileName = 'package.json'
        public readonly folder = __dirname + '/data'
        public readonly targetName = 'test-upload-data (auto-generated)'
        public readonly asset: AssetsGateway.NewAssetResponse<FilesBackend.UploadResponse>

        constructor(
            params: {
                asset?: AssetsGateway.NewAssetResponse<FilesBackend.UploadResponse>
            } = {},
        ) {
            Object.assign(this, params)
        }
    }

    const test$ = shell$(new Context()).pipe(
        uploadTest<Context>({
            createOperator: upload<Context>({
                inputs: (shell) => {
                    return {
                        body: {
                            fileName: shell.context.targetName,
                            path: path.resolve(
                                shell.context.folder,
                                shell.context.fileName,
                            ),
                        },
                        queryParameters: { folderId: shell.homeFolderId },
                    }
                },
                newContext: (
                    shell,
                    resp: AssetsGateway.NewAssetResponse<FilesBackend.UploadResponse>,
                ) => {
                    return new Context({
                        ...shell.context,
                        asset: resp,
                    })
                },
            }),
            getRawOperator: getFileInfo<Context>(
                (shell) => {
                    return {
                        fileId: shell.context.asset.rawId,
                    }
                },
                {
                    sideEffects: (resp) => {
                        expect(resp).toBeTruthy()
                    },
                },
            ),
        }),
    )

    await firstValueFrom(test$)
})

test('upload asset with files', async () => {
    class Context implements UploadContext {
        public readonly asset: NewAssetResponse<Record<string, never>>

        constructor(
            params: {
                asset?: AssetsGateway.NewAssetResponse<FilesBackend.UploadResponse>
            } = {},
        ) {
            Object.assign(this, params)
        }
    }

    const test$ = shell$(new Context()).pipe(
        uploadTest<Context>({
            createOperator: createAssetWithFiles(
                (shell) => {
                    return {
                        body: {
                            kind: 'custom-asset',
                            rawId: 'upload-asset-with-files',
                            name: 'Upload asset with files (upload test in local-youwol-client)',
                            description:
                                'A custom asset used to test uploading asset with files',
                            tags: ['integration-test', 'local-youwol-client'],
                        },
                        queryParameters: {
                            folderId: shell.homeFolderId,
                        },
                        zipPath: path.resolve(
                            __dirname,
                            './data/test-add-files.zip',
                        ),
                    }
                },
                {
                    newShell: (shell: Shell<Context>, resp) => {
                        return newShell(shell, resp, (shell, resp) => ({
                            ...shell.context,
                            asset: resp,
                        }))
                    },
                },
            ),
            getRawOperator: getAssetZipFiles<Context>(
                (shell) => {
                    return {
                        assetId: shell.context.asset.assetId,
                    }
                },
                {
                    sideEffects: (resp) => {
                        expect(resp).toBeTruthy()
                    },
                },
            ),
        }),
    )

    await firstValueFrom(test$)
})
