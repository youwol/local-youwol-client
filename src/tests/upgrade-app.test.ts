// eslint-disable-next-line eslint-comments/disable-enable-pair -- Don't know why this very line is needed
/* eslint-disable jest/no-done-callback -- eslint-comment Find a good way to work with rxjs in jest */

import { PyYouwolClient } from '../lib'
import { Shell, shell$, testSetup$, testTearDown$ } from './shell'
import {
    CdnBackend,
    ExplorerBackend,
    AssetsGateway,
} from '@youwol/http-clients'
import {
    HTTPError,
    raiseHTTPErrors,
    RootRouter,
    send,
} from '@youwol/http-primitives'
import { map, mergeMap, reduce, takeWhile, tap } from 'rxjs/operators'
import { forkJoin, merge, of, ReplaySubject } from 'rxjs'
import { uploadPackages } from './utils'
import path from 'path'

jest.setTimeout(100 * 1000)
const pyYouwol = new PyYouwolClient()

let currentShell: Shell<unknown> = undefined

const packageName = '@youwol/todo-app-js-test'
const versions = [
    '0.0.1',
    '0.0.1-wip',
    '0.0.2',
    '0.1.0',
    '0.1.2',
    '0.2.0-wip',
    '1.1.1',
]
const filePaths = (versions: string[]) =>
    versions.map((version) => {
        return path.resolve(
            __dirname,
            `./data/test-packages/todo-app-js-test#${version}.zip`,
        )
    })

beforeAll((done) => {
    const cdnClient = new CdnBackend.Client({
        basePath: '/admin/remote/api/assets-gateway/cdn-backend',
    })
    const explorerClient = new ExplorerBackend.Client({
        basePath: '/admin/remote/api/assets-gateway/treedb-backend',
    })
    forkJoin([
        cdnClient.getLibraryInfo$({ libraryId: window.btoa(packageName) }),
        explorerClient.getDefaultUserDrive$().pipe(raiseHTTPErrors()),
    ])
        .pipe(
            // To re-publish all versions (instead of the next block):
            // mergeMap(([_, respDrive]) => {
            //     return uploadPackages({filePaths: filePaths(versions), folderId: respDrive.homeFolderId, cdnClient })
            // }),
            mergeMap(([respCdn, respDrive]) => {
                if (
                    respCdn instanceof HTTPError /* && respCdn.status == 404*/
                ) {
                    if (respCdn.status !== 404) {
                        throw `Unexpected error code while getting library info ${respCdn.status}`
                    }
                    return uploadPackages({
                        filePaths: filePaths(versions),
                        folderId: respDrive.homeFolderId,
                        cdnClient,
                    })
                }
                const missing = versions.filter(
                    (v) => !respCdn.versions.includes(v),
                )
                if (missing.length > 0) {
                    return uploadPackages({
                        filePaths: filePaths(missing),
                        folderId: respDrive.homeFolderId,
                        cdnClient,
                    })
                }
                if (missing.length === 0) {
                    console.log(
                        `All required versions of ${packageName}`,
                        respCdn.versions,
                    )
                }
                return of(respCdn)
            }),
        )
        .subscribe(() => {
            done()
        })
})
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

function expectTestUpgrade({
    installVersion,
    queryVersion,
    expectedVersion,
    targetLabel,
}: {
    targetLabel: string
    installVersion?: string
    queryVersion: string
    expectedVersion: string
}) {
    const localCdnClient = new AssetsGateway.Client().cdn
    class Context {}
    // those 2 are buffers to not miss events, they will replay all of them
    const downloadEvents$ = new ReplaySubject()
    const packageEvents$ = new ReplaySubject()

    pyYouwol.admin.system.webSocket.downloadEvent$().subscribe((d) => {
        downloadEvents$.next(d)
    })
    pyYouwol.admin.localCdn.webSocket.packageEvent$().subscribe((d) => {
        packageEvents$.next(d)
    })

    return shell$<Context>(new Context()).pipe(
        tap((shell: Shell<Context>) => (currentShell = shell)),
        mergeMap((shell) => {
            return installVersion
                ? uploadPackages({
                      filePaths: filePaths([installVersion]),
                      folderId: shell.homeFolderId,
                      cdnClient: localCdnClient,
                  }).pipe(map(() => shell))
                : of(shell)
        }),
        send<string, Context>({
            inputs: (_shell) => {
                return {
                    commandType: 'query',
                    path: `${RootRouter.HostName}/applications/${packageName}/${queryVersion}`,
                }
            },
            sideEffects: (response) => {
                expect(
                    response.includes(
                        `href="/applications/${packageName}/${expectedVersion}`,
                    ),
                ).toBeTruthy()
            },
        }),
        mergeMap(() => merge(packageEvents$, downloadEvents$)),
        takeWhile((event) => {
            return (
                event['data'] &&
                event['data']['type'] != 'succeeded' &&
                event['labels'].includes(targetLabel)
            )
        }, true),
        reduce((acc, e) => [...acc, e], []),
        tap((events) => {
            // in theory: DownloadEvent.enqueued, DownloadEvent.started, PackageEventResponse.downloadStarted,
            // PackageEventResponse.downloadDone, DownloadEvent.succeeded
            // BUT: the enqueued event is not always caught (e.g. if this test runs in standalone) as
            // ws connection may have been connected after this message is sent
            if (![4, 5].includes(events.length)) {
                console.error(
                    `Error: download ${packageName} from app URL -> wrong events count`,
                )
                console.log(events)
            }
            expect([4, 5].includes(events.length)).toBeTruthy()
            const packageEvents = events.filter(
                (event) => event.data['packageName'],
            )
            expect(packageEvents).toHaveLength(2)
            packageEvents.forEach((e) => {
                expect(e.data.packageName).toBe(packageName)
                // expect(e.data.version).toBe(expectedVersion)
            })
        }),
    )
}

// eslint-disable-next-line jest/expect-expect -- expectation factorized in expectTestUpgrade
test('upgrade: 0.1.0 -> latest', (done) => {
    expectTestUpgrade({
        installVersion: '0.1.0',
        queryVersion: 'latest',
        expectedVersion: '1.1.1',
        targetLabel: 'upgrade: 0.1.0 -> latest',
    }).subscribe(() => {
        done()
    })
})

// eslint-disable-next-line jest/expect-expect -- expectation factorized in expectTestUpgrade
test('upgrade: 0.1.0 -> ^0.0.1', (done) => {
    expectTestUpgrade({
        installVersion: '0.1.0',
        queryVersion: '^0.0.1',
        expectedVersion: '0.0.1',
        targetLabel: 'upgrade: 0.1.0 -> ^0.0.1',
    }).subscribe(() => {
        done()
    })
})

// eslint-disable-next-line jest/expect-expect -- expectation factorized in expectTestUpgrade
test('upgrade: none -> x', (done) => {
    expectTestUpgrade({
        queryVersion: 'x',
        expectedVersion: '1.1.1',
        targetLabel: 'upgrade: none -> x',
    }).subscribe(() => {
        done()
    })
})
