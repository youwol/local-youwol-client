// eslint-disable-next-line eslint-comments/disable-enable-pair -- to not have problem
/* eslint-disable jest/no-done-callback -- eslint-comment It is required because */

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
} from './shell'
import { Observable } from 'rxjs'
import path from 'path'
import { setup$ } from './local-youwol-test-setup'

jest.setTimeout(20 * 1000)
beforeAll(async (done) => {
    setup$({
        localOnly: false,
        email: 'int_tests_yw-users@test-user',
    }).subscribe(() => {
        done()
    })
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

test('upload flux project', (done) => {
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
    shell$(new Context())
        .pipe(
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
        .subscribe(() => {
            done()
        })
})

test('upload story', (done) => {
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
    shell$(new Context())
        .pipe(
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
        .subscribe(() => {
            done()
        })
})

test('upload data', (done) => {
    class Context implements UploadContext {
        public readonly fileName = 'package.json'
        public readonly folder = __dirname + '/test-data'
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

    shell$(new Context())
        .pipe(
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
        .subscribe(() => {
            done()
        })
})
