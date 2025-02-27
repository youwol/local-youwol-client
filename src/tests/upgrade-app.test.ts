import { PyYouwolClient } from '../lib'
import { Shell, shell$, testSetup$, testTearDown$ } from './shell'
import {
    CdnBackend,
    ExplorerBackend,
    AssetsGateway,
} from '@youwol/http-clients'
import { raiseHTTPErrors, RootRouter, send } from '@youwol/http-primitives'
import { map, mergeMap, reduce, takeWhile, tap } from 'rxjs/operators'
import { firstValueFrom, forkJoin, merge, of, ReplaySubject } from 'rxjs'
import { isHTTPError, uploadPackagesAndCheck$ } from './utils'
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
    versions.reduce((acc, version) => {
        return {
            ...acc,
            [version]: path.resolve(
                __dirname,
                `./data/test-packages/todo-app-js-test#${version}.zip`,
            ),
        }
    }, {}) as { [k: string]: string }

beforeAll(async () => {
    const cdnClient = new CdnBackend.Client({
        basePath: '/admin/remote/api/assets-gateway/cdn-backend',
    })
    const explorerClient = new ExplorerBackend.Client({
        basePath: '/admin/remote/api/assets-gateway/treedb-backend',
    })
    const beforeAll$ = forkJoin([
        cdnClient.getLibraryInfo$({ libraryId: window.btoa(packageName) }),
        explorerClient.getDefaultUserDrive$().pipe(raiseHTTPErrors()),
    ]).pipe(
        // To re-publish all versions (instead of the next block):
        // mergeMap(([_, respDrive]) => {
        //     return uploadPackages({filePaths: filePaths(versions), folderId: respDrive.homeFolderId, cdnClient })
        // }),
        mergeMap(([respCdn, respDrive]) => {
            if (isHTTPError(respCdn)) {
                if (respCdn.status !== 404) {
                    throw `Unexpected error code while getting library info ${respCdn.status}`
                }
                return uploadPackagesAndCheck$({
                    packageName,
                    paths: filePaths(versions),
                    folderId: respDrive.homeFolderId,
                    cdnClient,
                    check: 'strict',
                })
            }
            const missingVersions = versions.filter(
                (v) => !respCdn.versions.includes(v),
            )

            if (missingVersions.length === 0) {
                console.log(
                    `All required versions of ${packageName} available in remote`,
                    respCdn.versions,
                )
                return of(respCdn)
            }
            return uploadPackagesAndCheck$({
                packageName,
                paths: filePaths(missingVersions),
                folderId: respDrive.homeFolderId,
                cdnClient,
                check: 'loose',
            })
        }),
    )
    await firstValueFrom(beforeAll$)
})
beforeEach(async () => {
    await firstValueFrom(testSetup$())
})

afterEach(async () => {
    await firstValueFrom(testTearDown$(currentShell))
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

    return shell$<Context>(new Context()).pipe(
        tap((shell) => {
            currentShell = shell
            shell.addSubscription(
                'downloadEvents$',
                pyYouwol.admin.system.webSocket
                    .downloadEvent$()
                    .subscribe((d) => {
                        downloadEvents$.next(d)
                    }),
            )
            shell.addSubscription(
                'packageEvents$',
                pyYouwol.admin.localCdn.webSocket
                    .packageEvent$()
                    .subscribe((d) => {
                        packageEvents$.next(d)
                    }),
            )
        }),
        mergeMap((shell) => {
            return installVersion
                ? uploadPackagesAndCheck$({
                      packageName,
                      paths: filePaths([installVersion]),
                      folderId: shell.homeFolderId,
                      cdnClient: localCdnClient,
                      check: 'strict',
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
test('upgrade: 0.1.0 -> latest', async () => {
    await firstValueFrom(
        expectTestUpgrade({
            installVersion: '0.1.0',
            queryVersion: 'latest',
            expectedVersion: '1.1.1',
            targetLabel: 'upgrade: 0.1.0 -> latest',
        }),
    )
})

// eslint-disable-next-line jest/expect-expect -- expectation factorized in expectTestUpgrade
test('upgrade: 0.1.0 -> ^0.0.1', async () => {
    await firstValueFrom(
        expectTestUpgrade({
            installVersion: '0.1.0',
            queryVersion: '^0.0.1',
            expectedVersion: '0.0.1',
            targetLabel: 'upgrade: 0.1.0 -> ^0.0.1',
        }),
    )
})

// eslint-disable-next-line jest/expect-expect -- expectation factorized in expectTestUpgrade
test('upgrade: none -> x', async () => {
    await firstValueFrom(
        expectTestUpgrade({
            queryVersion: 'x',
            expectedVersion: '1.1.1',
            targetLabel: 'upgrade: none -> x',
        }),
    )
})
