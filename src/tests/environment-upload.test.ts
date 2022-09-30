// eslint-disable-next-line eslint-comments/disable-enable-pair -- to not have problem
/* eslint-disable jest/no-done-callback -- eslint-comment It is required because */

import {
    Test,
    AssetsGateway,
    FluxBackend,
    StoriesBackend,
    FilesBackend,
} from '@youwol/http-clients'
Test.mockRequest()

import { uploadAsset, switchToRemoteShell } from './shell'
import { Observable } from 'rxjs'
import path from 'path'
import { readFileSync } from 'fs'
import { setup$ } from '../lib'

jest.setTimeout(10000 * 1000)
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
    return (source$: Observable<Test.Shell<TContext>>) => {
        return source$.pipe(
            createOperator,
            uploadAsset<TContext>({
                inputs: (shell) => ({
                    assetId: shell.context.asset.assetId,
                }),
            }),
            Test.ExplorerBackend.queryChildren<TContext>({
                inputs: (shell) => ({
                    parentId: shell.homeFolderId,
                }),
                sideEffects: (resp, shell) => {
                    const found = resp.items.find(
                        (item) => item.assetId == shell.context.asset.assetId,
                    )
                    expect(found).toBeTruthy()
                    expect(found['origin'].remote).toBeTruthy()
                    expect(found['origin'].local).toBeTruthy()
                },
            }),
            switchToRemoteShell(),
            Test.AssetsBackend.getAsset({
                inputs: (shell: Test.Shell<UploadContext>) => {
                    return {
                        assetId: shell.context.asset.assetId,
                    }
                },
                sideEffects: (resp, shell) => {
                    expect(resp.name).toBe(shell.context.asset.name)
                },
            }),
            getRawOperator,
            Test.ExplorerBackend.trashItem({
                inputs: (shell) => ({ itemId: shell.context.asset.itemId }),
            }),
            Test.ExplorerBackend.queryChildren<TContext>({
                inputs: (shell) => ({
                    parentId: shell.homeFolderId,
                }),
                sideEffects: (resp, shell) => {
                    const found = resp.items.find(
                        (item) => item.assetId == shell.context.asset.assetId,
                    )
                    expect(found).toBeFalsy()
                },
            }),
            Test.ExplorerBackend.purgeDrive({
                inputs: (shell) => ({ driveId: shell.defaultDriveId }),
            }),
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
    Test.shell$(new Context())
        .pipe(
            uploadTest({
                createOperator: Test.FluxBackend.newProject<Context>({
                    inputs: (shell) => ({
                        queryParameters: { folderId: shell.homeFolderId },
                        body: { name: shell.context.projectName },
                    }),
                    newContext: (
                        shell,
                        resp: AssetsGateway.NewAssetResponse<FluxBackend.NewProjectResponse>,
                    ) => {
                        return new Context({
                            ...shell.context,
                            asset: resp,
                        })
                    },
                }),
                getRawOperator: Test.FluxBackend.getProject<Context>({
                    inputs: (shell) => {
                        return {
                            projectId: shell.context.asset.rawId,
                        }
                    },
                    sideEffects: (resp) => {
                        expect(resp).toBeTruthy()
                    },
                }),
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
    Test.shell$(new Context())
        .pipe(
            uploadTest({
                createOperator: Test.StoriesBackend.createStory<Context>({
                    inputs: (shell) => ({
                        queryParameters: { folderId: shell.homeFolderId },
                        body: { title: shell.context.storyName },
                    }),
                    newContext: (
                        shell,
                        resp: AssetsGateway.NewAssetResponse<StoriesBackend.CreateStoryResponse>,
                    ) => {
                        return new Context({
                            ...shell.context,
                            asset: resp,
                        })
                    },
                }),
                getRawOperator: Test.StoriesBackend.getStory<Context>({
                    inputs: (shell) => {
                        return {
                            storyId: shell.context.asset.rawId,
                        }
                    },
                    sideEffects: (resp) => {
                        expect(resp).toBeTruthy()
                    },
                }),
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

    Test.shell$(new Context())
        .pipe(
            uploadTest<Context>({
                createOperator: Test.FilesBackend.upload<Context>({
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
                    fileReaderSync: readFileSync,
                }),
                getRawOperator: Test.FilesBackend.getInfo<Context>({
                    inputs: (shell) => {
                        return {
                            fileId: shell.context.asset.rawId,
                        }
                    },
                    sideEffects: (resp) => {
                        expect(resp).toBeTruthy()
                    },
                }),
            }),
        )
        .subscribe(() => {
            done()
        })
})
