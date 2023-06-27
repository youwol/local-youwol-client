/* eslint-disable jest/no-done-callback -- eslint-comment Find a good way to work with rxjs in jest */
import AdmZip from 'adm-zip'
import { RootRouter, send } from '@youwol/http-primitives'

import { mergeMap, tap } from 'rxjs/operators'
import { PyYouwolClient } from '../lib'

import { from, Observable, ReplaySubject } from 'rxjs'
import {
    remoteCustomAssetId,
    remoteDataFileAssetId,
    remoteFluxAssetId,
    remoteStoryAssetId,
} from './remote_assets_id'
import {
    addBookmarkLog,
    expectDownloadEvents,
    getAssetZipFiles,
    getStoryDocuments,
    Shell,
    shell$,
    testSetup$,
    testTearDown$,
} from './shell'
import { DownloadEvent } from '../lib/routers/system'

import path from 'path'

import { writeFileSync } from 'fs'

const pyYouwol = new PyYouwolClient()

jest.setTimeout(10 * 1000)

let currentShell: Shell<unknown> = undefined

beforeEach((done) => {
    testSetup$().subscribe(() => {
        done()
    })
})

afterEach((done) => {
    testTearDown$(currentShell).subscribe(() => {
        done()
    })
})

function test_download_asset<TContext>({
    assetId,
    whileDownloadOperator,
    getTestPath,
    context,
}: {
    assetId: string
    getTestPath: string
    whileDownloadOperator?: (
        observable: Observable<Shell<TContext>>,
    ) => Observable<Shell<TContext>>
    context: TContext
}) {
    const downloadEvents$ = new ReplaySubject<{ data: DownloadEvent }>()
    const idOp = (observable) => observable
    whileDownloadOperator = whileDownloadOperator || idOp
    return shell$<TContext>(context).pipe(
        // ensure shell's tearDown in 'afterEach'
        tap((shell) => (currentShell = shell)),
        // start recording 'download events'
        tap((shell) => {
            shell.addSubscription(
                'downloadEvents',
                pyYouwol.admin.system.webSocket
                    .downloadEvent$()
                    .subscribe((d) => {
                        downloadEvents$.next(d)
                    }),
            )
        }),
        addBookmarkLog({ text: `Start` }),
        addBookmarkLog({
            text: `GET asset's raw part to trigger download`,
        }),
        send<string, TContext>({
            inputs: () => {
                return {
                    commandType: 'query',
                    path: getTestPath,
                }
            },
            sideEffects: (response) => {
                expect(response).toBeTruthy()
            },
        }),
        whileDownloadOperator,
        addBookmarkLog({
            text: `Wait for download to proceed successfully`,
        }),
        expectDownloadEvents(assetId, downloadEvents$),
        addBookmarkLog({
            text: `Make sure the asset has been downloaded locally`,
        }),
        send<string, TContext>({
            inputs: () => {
                return {
                    commandType: 'query',
                    path: getTestPath,
                    nativeOptions: {
                        headers: { 'py-youwol-local-only': 'true' },
                    },
                }
            },
            sideEffects: (response) => {
                expect(response).toBeTruthy()
            },
        }),
    )
}

// eslint-disable-next-line jest/expect-expect -- expects are factorized in test_download_asset
test('download flux-project', (done) => {
    class Context {}
    const assetId = remoteFluxAssetId
    const getTestPath = `${
        RootRouter.HostName
    }/api/assets-gateway/flux-backend/projects/${window.atob(assetId)}`

    test_download_asset({
        assetId,
        getTestPath,
        context: new Context(),
    }).subscribe(() => done())
})

// eslint-disable-next-line jest/expect-expect -- expects are factorized in test_download_asset
test('download data', (done) => {
    class Context {}
    const assetId = remoteDataFileAssetId
    const getTestPath = `${
        RootRouter.HostName
    }/api/assets-gateway/files-backend/files/${window.atob(assetId)}`

    test_download_asset({
        assetId,
        getTestPath,
        context: new Context(),
    }).subscribe(() => done())
})

test('download story', (done) => {
    class Context {
        public readonly assetId = remoteStoryAssetId
        public readonly rawId = window.atob(remoteStoryAssetId)
    }
    const getTestPath = `${
        RootRouter.HostName
    }/api/assets-gateway/stories-backend/stories/${window.atob(
        remoteStoryAssetId,
    )}`

    test_download_asset({
        assetId: remoteStoryAssetId,
        whileDownloadOperator: (shell$: Observable<Shell<Context>>) => {
            return shell$.pipe(
                addBookmarkLog({
                    text: `Make sure documents can be retrieved while downloading (from remote)`,
                }),
                getStoryDocuments(
                    (s) => {
                        return {
                            storyId: s.context.rawId,
                            parentDocumentId: s.context.rawId,
                        }
                    },
                    {
                        sideEffects: (response) => {
                            expect(response.documents.length).toBeGreaterThan(0)
                        },
                    },
                ),
            )
        },
        getTestPath,
        context: new Context(),
    }).subscribe(() => done())
})

test('download custom asset with files', (done) => {
    class Context {
        public readonly assetId = remoteCustomAssetId
        public readonly zipPath = path.resolve(
            __dirname,
            './data/test-download-asset-files.zip',
        )
        public readonly blobZip: Blob
        constructor(params = {}) {
            Object.assign(this, params)
        }
    }

    const assetId = remoteCustomAssetId
    const getTestPath = `${RootRouter.HostName}/api/assets-gateway/assets-backend/assets/${assetId}/files/topLevelFile.json`

    test_download_asset({
        assetId,
        getTestPath,
        context: new Context(),
    })
        .pipe(
            addBookmarkLog({ text: `Retrieve asset's zip files` }),
            getAssetZipFiles(
                (shell: Shell<Context>) => {
                    return {
                        assetId: shell.context.assetId,
                        callerOptions: {
                            headers: { localOnly: 'true' },
                        },
                    }
                },
                {
                    newShell: (shell, resp) => {
                        return new Shell<Context>({
                            context: new Context({
                                ...shell.context,
                                blobZip: resp,
                            }),
                        })
                    },
                },
            ),
            addBookmarkLog({ text: `Save zip file` }),
            mergeMap((shell) => {
                return from(
                    new Response(shell.context.blobZip)
                        .arrayBuffer()
                        .then((buffer) => {
                            writeFileSync(
                                shell.context.zipPath,
                                Buffer.from(buffer),
                            )
                            return shell
                        }),
                )
            }),
            addBookmarkLog({ text: `Assert content of zip file` }),
            mergeMap((shell) => {
                const promise = new Promise((resolve) => {
                    const zipped = new AdmZip(shell.context.zipPath)
                    zipped.readAsTextAsync('topLevelFile.json', (data) => {
                        expect(JSON.parse(data).summary).toBe(
                            'a file at the top level',
                        )
                    })
                    zipped.readAsTextAsync(
                        'innerFolder/innerFile.json',
                        (data) => {
                            expect(JSON.parse(data).summary).toBe(
                                'A file in a folder.',
                            )
                            resolve(true)
                        },
                    )
                })
                return from(promise)
            }),
        )
        .subscribe(() => {
            done()
        })
})

/* eslint-enable jest/no-done-callback -- re-enable */
