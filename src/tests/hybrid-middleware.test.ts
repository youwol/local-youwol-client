import { remoteStoryAssetId } from './remote_assets_id'
import {
    applyTestCtxLabels,
    getAsset,
    getPermissions,
    resetTestCtxLabels,
    Shell,
    shell$,
} from './shell'
import { setup$ } from './local-youwol-test-setup'
import { PyYouwolClient } from '../lib'
import { delay, map, mergeMap, take, tap } from 'rxjs/operators'
import { BehaviorSubject, firstValueFrom, from, of } from 'rxjs'
import { DownloadEvent } from '../lib/routers/system'
import { CdnBackend } from '@youwol/http-clients'
import { uploadPackagesAndCheck$ } from './utils'
import path from 'path'

jest.setTimeout(20 * 1000)

const pyYouwol = new PyYouwolClient()

beforeEach(async () => {
    await firstValueFrom(
        setup$({
            localOnly: false,
            email: 'int_tests_yw-users@test-user',
        }).pipe(tap(() => applyTestCtxLabels())),
    )
})

afterEach(async () => {
    await firstValueFrom(of(undefined).pipe(resetTestCtxLabels()))
})

test('can retrieve asset info when remote only', async () => {
    class Context {
        // the creation of the test data is gathered in the youwol-config.py
        public readonly assetId = remoteStoryAssetId
    }
    const downloadEvents$ = new BehaviorSubject<{ data: DownloadEvent }>(
        undefined,
    )
    pyYouwol.admin.system.webSocket
        .downloadEvent$()
        .pipe(take(3))
        .subscribe((d) => {
            downloadEvents$.next(d)
        })

    const test$ = shell$<Context>(new Context()).pipe(
        getAsset(
            (shell: Shell<Context>) => {
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
        getPermissions(
            (shell) => {
                return {
                    assetId: shell.context.assetId,
                    callerOptions: { headers: { localOnly: 'true' } },
                }
            },
            {
                sideEffects: (response) => {
                    expect(response.write).toBeTruthy()
                    expect(response.read).toBeTruthy()
                    expect(response.share).toBeTruthy()
                },
            },
        ),
        delay(500),
    )
    await firstValueFrom(test$)
    expect(downloadEvents$.value).toBeFalsy()
})

test('coupled loading graph', async () => {
    /**
     * In this test we try to resolve the loading graph of `rx-tree-views`.
     * It depends on `rxjs#^7.5.6`, `rx-vdom#^1.0.1`.
     * We put in local a fake version of `rxjs` : `7.999.0` (to ensure that it is resolved as the last of API key v7).
     * We expect a resolved loading graph, with rxjs at version `7.999.0`.
     */
    class Context {
        // the creation of the test data is gathered in the youwol-config.py
        public readonly assetId = remoteStoryAssetId
    }
    const cdnClient = new CdnBackend.Client()
    const basePath = './data/test-packages'
    const test$ = shell$<Context>(new Context()).pipe(
        mergeMap((shell) => {
            return uploadPackagesAndCheck$({
                packageName: 'rxjs',
                paths: {
                    '7.999.0': path.resolve(
                        __dirname,
                        `${basePath}/rxjs#7.999.0.zip`,
                    ),
                },
                folderId: shell.homeFolderId,
                cdnClient,
                check: 'strict',
            }).pipe(map((_resp) => shell))
        }),
        mergeMap(() => {
            const body = {
                libraries: [
                    { name: '@youwol/rx-tree-views', version: '0.3.1' },
                ],
            }
            return from(
                fetch(
                    'http://localhost:2001/api/assets-gateway/cdn-backend/queries/loading-graph',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(body),
                    },
                ).then((resp) => resp.json()),
            )
        }),
    )

    const resp = await firstValueFrom(test$)
    expect(resp.graphType).toBe('sequential-v2')
    expect(resp.lock).toHaveLength(3)
    const packages = resp.lock.reduce((acc, p) => ({ ...acc, [p.name]: p }), {})
    expect(packages['@youwol/rx-tree-views']).toBeTruthy()
    expect(packages['rxjs']).toBeTruthy()
    expect(packages['@youwol/rx-vdom']).toBeTruthy()
    expect(packages['rxjs'].version).toBe('7.999.0')
    expect(packages['rxjs'].fingerprint).toBe(
        'a413cd90a586944a2f98afb399ca7160',
    )
})
