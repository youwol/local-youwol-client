/* eslint-disable jest/no-done-callback -- eslint-comment Find a good way to work with rxjs in jest */
import AdmZip from 'adm-zip'
import {
    raiseHTTPErrors,
    RootRouter,
    expectAttributes,
    send,
} from '@youwol/http-primitives'

import {
    mergeMap,
    reduce,
    skipWhile,
    take,
    takeWhile,
    tap,
} from 'rxjs/operators'
import { ContextMessage, PyYouwolClient } from '../lib'

import { install, State } from '@youwol/cdn-client'
import { from, merge, Observable, of, OperatorFunction } from 'rxjs'
import {
    remoteCustomAssetId,
    remoteDataFileAssetId,
    remoteFluxAssetId,
} from './remote_assets_id'
import {
    expectDownloadEvents,
    getAsset,
    getAssetZipFiles,
    Shell,
    shell$,
} from './shell'
import { setup$ } from './local-youwol-test-setup'
import { DownloadEvent } from '../lib/routers/system'
import {
    GetCdnStatusResponse,
    PackageEventResponse,
    ResetCdnResponse,
} from '../lib/routers/local-cdn'
import path from 'path'
import { writeFileSync } from 'fs'

const pyYouwol = new PyYouwolClient()

jest.setTimeout(20 * 1000)

beforeEach(async (done) => {
    setup$({
        localOnly: false,
        email: 'int_tests_yw-users@test-user',
    }).subscribe(() => {
        done()
    })
})

function testInstall(
    modules: string[],
    expectedStatus: 'succeeded' | 'failed' = 'succeeded',
) {
    return (
        source$: Observable<unknown>,
    ): Observable<ContextMessage<DownloadEvent>[]> => {
        return source$.pipe(
            mergeMap(() => {
                return install({
                    modules,
                })
            }),
            mergeMap(() => pyYouwol.admin.system.webSocket.downloadEvent$()),
            tap((event) => {
                // console.log(event.data)
                expect(event).toBeTruthy()
            }),
            skipWhile((event) => {
                return event.data.type != expectedStatus
            }),
            take(1),
            reduce((acc, e) => {
                /*if (acc.length == 0) {
                    expect(e.data.type).toBe('enqueued')
                }*/
                return [...acc, e]
            }, []),
            /*
            tap((events) => {
                const targets: DownloadEventType[] = [
                    'enqueued',
                    'started',
                    expectedStatus,
                ]
                expect(events.map((e) => e.data.type)).toEqual(targets)
            }),*/
        )
    }
}

// eslint-disable-next-line jest/expect-expect -- expects are factorized in test_download_asset
test('install package rxjs', (done) => {
    of({})
        .pipe(testInstall(['rxjs']))
        .subscribe(() => {
            done()
        })
})

// eslint-disable-next-line jest/expect-expect -- expects are factorized in test_download_asset
test('install package @youwol/logging#0.0.2-next => Failure', (done) => {
    of({})
        .pipe(
            //wait for websocket to connect
            take(1),
            testInstall(['@youwol/logging#0.0.2-next'], 'failed'),
        )
        .subscribe(() => {
            done()
        })
})

test('install package rxjs + clear + install package rxjs', (done) => {
    of({})
        .pipe(
            testInstall(['rxjs']),
            mergeMap(() => pyYouwol.admin.localCdn.resetCdn$()),
            raiseHTTPErrors(),
            tap((resp: ResetCdnResponse) => {
                expectAttributes(resp, ['deletedPackages'])
                expect(resp.deletedPackages).toEqual(['rxjs'])
                State.resetCache()
            }),
            mergeMap(() => pyYouwol.admin.localCdn.getStatus$()),
            raiseHTTPErrors(),
            tap((status: GetCdnStatusResponse) => {
                expect(status.packages).toHaveLength(0)
            }),
            testInstall(['rxjs']),
        )
        .subscribe(() => {
            done()
        })
})

test('download flux-builder#latest from app URL', (done) => {
    class Context {
        public readonly assetId =
            'YTZjZDhlMzYtYTE5ZC00YTI5LTg3NGQtMDRjMTI2M2E5YjA3'
    }

    shell$<Context>(new Context())
        .pipe(
            send<string, Context>({
                inputs: (shell) => {
                    return {
                        commandType: 'query',
                        path: `${
                            RootRouter.HostName
                        }/applications/@youwol/flux-builder/latest?id=${window.atob(
                            shell.context.assetId,
                        )}`,
                    }
                },
                sideEffects: (response) => {
                    expect(
                        response.includes(
                            `href="/applications/@youwol/flux-builder/`,
                        ),
                    ).toBeTruthy()
                },
            }),
            mergeMap(() =>
                merge(
                    pyYouwol.admin.system.webSocket.downloadEvent$(),
                    pyYouwol.admin.localCdn.webSocket.packageEvent$({
                        packageName: '@youwol/flux-builder',
                    }),
                ),
            ),
            takeWhile((event) => {
                return event['data'] && event['data']['type'] != 'succeeded'
            }, true),
            reduce((acc, e) => [...acc, e], []),
            tap((events) => {
                // in theory: DownloadEvent.enqueued, DownloadEvent.started, PackageEventResponse.downloadStarted,
                // PackageEventResponse.downloadDone, DownloadEvent.succeeded
                // BUT: the enqueued event is not always caught (e.g. if this test runs in standalone) as
                // ws connection may have been connected after this message is sent
                if (![4, 5].includes(events.length)) {
                    console.error(
                        'Error: download flux-builder#latest from app URL -> wrong events count',
                    )
                    console.log(events)
                }
                expect([4, 5].includes(events.length)).toBeTruthy()
                const count = events.length
                expect(
                    (events[count - 2].data as PackageEventResponse)
                        .packageName,
                ).toBe('@youwol/flux-builder')
                expect((events[count - 1].data as DownloadEvent).rawId).toBe(
                    window.btoa('@youwol/flux-builder'),
                )
            }),
        )
        .subscribe(() => {
            done()
        })
})

function test_download_asset(assetId: string, basePath: string) {
    class Context {
        public readonly assetId = assetId
    }

    return shell$<Context>(new Context()).pipe(
        // make sure the asset exist and can be retrieved from deployed env
        getAsset(
            (shell) => {
                return {
                    assetId: shell.context.assetId,
                }
            },
            {
                sideEffects: (response, shell) => {
                    expect(response.assetId).toBe(shell.context.assetId)
                },
            },
        ),
        send<string, Context>({
            inputs: (shell) => {
                const rawId = window.atob(shell.context.assetId)
                return {
                    commandType: 'query',
                    path: `${RootRouter.HostName}/api/assets-gateway/${basePath}/${rawId}`,
                }
            },
            sideEffects: (response) => {
                expect(response).toBeTruthy()
            },
        }) as OperatorFunction<Shell<Context>, Shell<Context>>,
        expectDownloadEvents(pyYouwol),
    )
}

// eslint-disable-next-line jest/expect-expect -- expects are factorized in test_download_asset
test('download flux-project', (done) => {
    test_download_asset(remoteFluxAssetId, 'flux-backend/projects').subscribe(
        () => done(),
    )
})

// eslint-disable-next-line jest/expect-expect -- expects are factorized in test_download_asset
test('download data', (done) => {
    test_download_asset(remoteDataFileAssetId, 'files-backend/files').subscribe(
        () => done(),
    )
})

test('download custom asset with files', (done) => {
    class Context {
        public readonly assetId = remoteCustomAssetId
        public readonly zipPath = path.resolve(
            __dirname,
            './test-data/test-download-asset-files.zip',
        )
    }

    shell$<Context>(new Context())
        .pipe(
            // make sure the asset exist and can be retrieved from deployed env
            getAsset(
                (shell) => {
                    return {
                        assetId: shell.context.assetId,
                    }
                },
                {
                    sideEffects: (response, shell) => {
                        expect(response.assetId).toBe(shell.context.assetId)
                    },
                },
            ),
            expectDownloadEvents(pyYouwol),
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
                    sideEffects: (response, shell) => {
                        const fileReader = new FileReader()
                        fileReader.onload = function (event) {
                            const buffer = event.target.result as ArrayBuffer
                            writeFileSync(
                                shell.context.zipPath,
                                Buffer.from(buffer),
                            )
                        }
                        fileReader.readAsArrayBuffer(response)
                    },
                },
            ),
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
