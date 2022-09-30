/* eslint-disable jest/no-done-callback -- eslint-comment Find a good way to work with rxjs in jest */
import { AssetsGateway, raiseHTTPErrors, Test } from '@youwol/http-clients'
Test.mockRequest()
import { Client, install } from '@youwol/cdn-client'
import { combineLatest, from } from 'rxjs'
import { mergeMap, reduce, take, tap } from 'rxjs/operators'
import { PyYouwolClient, setup$ } from '../lib'
import { expectDownloadEvents$, expectUpdateStatus } from './utils'

const pyYouwol = new PyYouwolClient()

jest.setTimeout(20 * 1000)

beforeEach(async (done) => {
    setup$({
        localOnly: true,
        email: 'int_tests_yw-users@test-user',
    }).subscribe(() => {
        done()
    })
})

test('pyYouwol.admin.local-cdn.status', (done) => {
    combineLatest([
        pyYouwol.admin.localCdn.getStatus$().pipe(raiseHTTPErrors()),
        pyYouwol.admin.localCdn.webSocket.status$(),
    ])
        .pipe(take(1))
        .subscribe(([respHttp, respWs]) => {
            expect(respHttp.packages).toHaveLength(0)
            expect(respWs.data.packages).toHaveLength(0)
            expect(respWs.attributes.topic).toBe('cdn')
            done()
        })
})

test('pyYouwol.admin.local-cdn.collectUpdates - empty', (done) => {
    combineLatest([
        pyYouwol.admin.localCdn
            .triggerCollectUpdates$()
            .pipe(raiseHTTPErrors()),
        pyYouwol.admin.localCdn.webSocket.updatesStatus$(),
    ])
        .pipe(take(1))
        .subscribe(([respHttp, respWs]) => {
            expect(respHttp.updates).toHaveLength(0)
            expect(respWs.data.updates).toHaveLength(0)
            expect(respWs.attributes.topic).toBe('updatesCdn')
            done()
        })
})

test('install & pyYouwol.admin.local-cdn.collectUpdates', (done) => {
    Client.HostName = Test.getPyYouwolBasePath()
    const httpClientsPackageId = window.btoa('@youwol/http-clients')
    from(
        install({
            modules: ['@youwol/http-clients'],
        }),
    )
        .pipe(
            tap(() => {
                expect(window['rxjs']).toBeTruthy()
                expect(window['@youwol/http-clients']).toBeTruthy()
            }),
            mergeMap(() => {
                return pyYouwol.admin.localCdn.webSocket.downloadedPackage$()
            }),
            tap((resp) => {
                Test.expectAttributes(resp.attributes, [
                    'packageName',
                    'packageVersion',
                ])
                Test.expectAttributes(resp.data, [
                    'packageName',
                    'versions',
                    'version',
                    'fingerprint',
                ])
            }),
            take(2),
            reduce((acc, e) => {
                return [...acc, e]
            }, []),
            tap((updates) => {
                expect(updates.map((p) => p.data.packageName).sort()).toEqual([
                    '@youwol/http-clients',
                    'rxjs',
                ])
            }),
            mergeMap(() => {
                return pyYouwol.admin.localCdn
                    .triggerCollectUpdates$()
                    .pipe(raiseHTTPErrors())
            }),
            tap((respHttp) => {
                expect(respHttp.updates).toHaveLength(2)
                const httpClient = respHttp.updates.find(
                    (update) => update.packageName == '@youwol/http-clients',
                )
                expectUpdateStatus(httpClient)
            }),
            mergeMap(() => {
                return combineLatest([
                    pyYouwol.admin.localCdn
                        .getStatus$()
                        .pipe(raiseHTTPErrors()),
                    pyYouwol.admin.localCdn.webSocket.status$(),
                ])
            }),
            tap(([respHttp, respWs]) => {
                expect(respHttp.packages).toHaveLength(2)
                expect(respWs.data).toEqual(respHttp)
                expect(respHttp.packages.map((p) => p.name).sort()).toEqual([
                    '@youwol/http-clients',
                    'rxjs',
                ])
                expect(respWs.attributes.topic).toBe('cdn')
            }),
            mergeMap(() => {
                return combineLatest([
                    pyYouwol.admin.localCdn
                        .getPackage$({
                            packageId: httpClientsPackageId,
                        })
                        .pipe(raiseHTTPErrors()),
                    pyYouwol.admin.localCdn.webSocket.package$({
                        packageId: httpClientsPackageId,
                    }),
                ])
            }),
            tap(([respHttp, respWs]) => {
                expect(respHttp.name).toBe('@youwol/http-clients')
                expect(respHttp.versions).toHaveLength(1)
                Test.expectAttributes(respHttp.versions[0], [
                    'version',
                    'filesCount',
                    'entryPointSize',
                ])
                expect(respHttp.versions[0].entryPointSize).toBeGreaterThan(0)
                expect(respHttp.versions[0].filesCount).toBeGreaterThan(0)
                expect(respWs.data).toEqual(respHttp)
            }),
            mergeMap(() => {
                return new AssetsGateway.AssetsGatewayClient().assets.queryAccessInfo$(
                    {
                        assetId: window.btoa(httpClientsPackageId),
                    },
                )
            }),
            tap((resp) => {
                expect(resp.ownerInfo.defaultAccess.read).toBe('authorized')
                expect(resp.ownerInfo.defaultAccess.share).toBe('authorized')
            }),
        )
        .subscribe(() => {
            done()
        })
})

test('download', (done) => {
    Client.HostName = Test.getPyYouwolBasePath()

    expectDownloadEvents$(pyYouwol).subscribe(() => done())

    pyYouwol.admin.localCdn
        .download$({
            body: {
                packages: [
                    {
                        packageName: 'lodash',
                        version: '4.17.15',
                    },
                ],
                checkUpdateStatus: true,
            },
        })
        .pipe(
            mergeMap(() => {
                return pyYouwol.admin.localCdn.webSocket.updateStatus$()
            }),
            take(1),
        )
        .subscribe((respWs) => {
            expect(respWs).toBeTruthy()
            expectUpdateStatus(respWs.data)
        })
})

/* eslint-enable jest/no-done-callback -- re-enable */
