import { raiseHTTPErrors, expectAttributes } from '@youwol/http-primitives'
import { AssetsGateway } from '@youwol/http-clients'

import { install } from '@youwol/webpm-client'
import { combineLatest, firstValueFrom, from, of, ReplaySubject } from 'rxjs'
import { mergeMap, reduce, take, tap } from 'rxjs/operators'
import { PyYouwolClient } from '../lib'
import {
    expectDownloadEvents$,
    expectUpdateStatus,
    uploadPackagesAndCheck$,
} from './utils'
import { setup$ } from './local-youwol-test-setup'
import { applyTestCtxLabels, resetTestCtxLabels, shell$ } from './shell'
import path from 'path'

const pyYouwol = new PyYouwolClient()

jest.setTimeout(20 * 1000)

beforeEach(async () => {
    await firstValueFrom(
        setup$({
            localOnly: true,
            email: 'int_tests_yw-users@test-user',
        }).pipe(tap(() => applyTestCtxLabels())),
    )
})

afterEach(async () => {
    await firstValueFrom(of(undefined).pipe(resetTestCtxLabels()))
})

test('pyYouwol.admin.local-cdn.status', async () => {
    const test$ = combineLatest([
        pyYouwol.admin.localCdn.getStatus$().pipe(raiseHTTPErrors()),
        pyYouwol.admin.localCdn.webSocket.status$(),
    ]).pipe(take(1))

    const [respHttp, respWs] = await firstValueFrom(test$)
    expect(respHttp.packages).toHaveLength(0)
    expect(respWs.data.packages).toHaveLength(0)
    expect(respWs.attributes.topic).toBe('cdn')
})

test('pyYouwol.admin.local-cdn.collectUpdates - empty', async () => {
    const test$ = combineLatest([
        pyYouwol.admin.localCdn
            .triggerCollectUpdates$()
            .pipe(raiseHTTPErrors()),
        pyYouwol.admin.localCdn.webSocket.updatesStatus$(),
    ]).pipe(take(1))
    const [respHttp, respWs] = await firstValueFrom(test$)
    expect(respHttp.updates).toHaveLength(0)
    expect(respWs.data.updates).toHaveLength(0)
    expect(respWs.attributes.topic).toBe('updatesCdn')
})

test('install & pyYouwol.admin.local-cdn.collectUpdates', async () => {
    const httpClientsPackageId = window.btoa('@youwol/http-clients')
    const test$ = from(
        install({
            modules: ['@youwol/http-clients'],
        }),
    ).pipe(
        tap(() => {
            expect(window['rxjs']).toBeTruthy()
            expect(window['@youwol/http-clients']).toBeTruthy()
        }),
        mergeMap(() => {
            return pyYouwol.admin.localCdn.webSocket.downloadedPackage$()
        }),
        tap((resp) => {
            expectAttributes(resp.attributes, ['packageName', 'packageVersion'])
            expectAttributes(resp.data, [
                'packageName',
                'versions',
                'version',
                'fingerprint',
            ])
        }),
        take(3),
        reduce((acc, e) => {
            return [...acc, e]
        }, []),
        tap((updates) => {
            expect(updates.map((p) => p.data.packageName).sort()).toEqual([
                '@youwol/http-clients',
                '@youwol/http-primitives',
                'rxjs',
            ])
        }),
        mergeMap(() => {
            return pyYouwol.admin.localCdn
                .triggerCollectUpdates$()
                .pipe(raiseHTTPErrors())
        }),
        tap((respHttp) => {
            expect(respHttp.updates).toHaveLength(3)
            const httpClient = respHttp.updates.find(
                (update) => update.packageName == '@youwol/http-clients',
            )
            expectUpdateStatus(httpClient)
        }),
        mergeMap(() => {
            return combineLatest([
                pyYouwol.admin.localCdn.getStatus$().pipe(raiseHTTPErrors()),
                pyYouwol.admin.localCdn.webSocket.status$(),
            ])
        }),
        tap(([respHttp, respWs]) => {
            expect(respHttp.packages).toHaveLength(3)
            expect(respWs.data).toEqual(respHttp)
            expect(respHttp.packages.map((p) => p.name).sort()).toEqual([
                '@youwol/http-clients',
                '@youwol/http-primitives',
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
            expectAttributes(respHttp.versions[0], [
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
    await firstValueFrom(test$)
})

test('download', async () => {
    const downloadEvents$ = new ReplaySubject()
    expectDownloadEvents$(pyYouwol).subscribe((d) => downloadEvents$.next(d))

    const test$ = pyYouwol.admin.localCdn
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
    const respWs = await firstValueFrom(test$)
    expect(respWs).toBeTruthy()
    await firstValueFrom(downloadEvents$)
})

// eslint-disable-next-line jest/expect-expect -- expectation factorized in uploadPackagesAndCheck$
test('publish versions with -wip or not', async () => {
    const resolvePath = (version: string) => {
        return path.resolve(
            __dirname,
            `./data/test-packages/todo-app-js-test#${version}.zip`,
        )
    }
    class Context {
        paths = {
            '0.0.1': resolvePath('0.0.1'),
            '0.0.1-wip': resolvePath('0.0.1-wip'),
            '0.0.2': resolvePath('0.0.2'),
            '1.1.1': resolvePath('1.1.1'),
        }
    }

    const test$ = shell$<Context>(new Context()).pipe(
        mergeMap((shell) => {
            return uploadPackagesAndCheck$({
                packageName: '@youwol/todo-app-js-test',
                paths: shell.context.paths,
                folderId: shell.homeFolderId,
                check: 'strict',
                cdnClient: new AssetsGateway.Client().cdn,
            })
        }),
    )
    await firstValueFrom(test$)
})
