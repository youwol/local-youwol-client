// eslint-disable-next-line eslint-comments/disable-enable-pair -- to not have problem
/* eslint-disable jest/no-done-callback -- eslint-comment It is required because */
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
import { BehaviorSubject, from, of } from 'rxjs'
import { DownloadEvent } from '../lib/routers/system'
import { CdnBackend } from '@youwol/http-clients'
import { uploadPackagesAndCheck$ } from './utils'
import path from 'path'

jest.setTimeout(20 * 1000)

const pyYouwol = new PyYouwolClient()

beforeEach((done) => {
    setup$({
        localOnly: false,
        email: 'int_tests_yw-users@test-user',
    })
        .pipe(tap(() => applyTestCtxLabels()))
        .subscribe(() => {
            done()
        })
})

afterEach((done) => {
    of(undefined)
        .pipe(resetTestCtxLabels())
        .subscribe(() => done())
})

test('can retrieve asset info when remote only', (done) => {
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

    shell$<Context>(new Context())
        .pipe(
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
        .subscribe(() => {
            expect(downloadEvents$.value).toBeFalsy()
            done()
        })
})

test('coupled loading graph', (done) => {
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
    const target = {
        graphType: 'sequential-v2',
        lock: [
            {
                name: '@youwol/rx-tree-views',
                version: '0.3.1',
                id: 'QHlvdXdvbC9yeC10cmVlLXZpZXdz',
                namespace: 'youwol',
                type: 'library',
                fingerprint: 'ccffc5e9343e4193966a939c0c715311',
                exportedSymbol: '@youwol/rx-tree-views',
                aliases: [],
                apiKey: '03',
            },
            {
                name: 'rxjs',
                version: '7.999.0',
                id: 'cnhqcw==',
                namespace: 'rxjs',
                type: 'library',
                fingerprint: 'a413cd90a586944a2f98afb399ca7160',
                exportedSymbol: 'rxjs',
                aliases: [],
                apiKey: '7',
            },
            {
                name: '@youwol/rx-vdom',
                version: '1.0.1',
                id: 'QHlvdXdvbC9yeC12ZG9t',
                namespace: 'youwol',
                type: 'library',
                fingerprint: '9bb534b31cc287963fbb39a03c3016d5',
                exportedSymbol: '@youwol/rx-vdom',
                aliases: [],
                apiKey: '1',
            },
        ],
        definition: [
            [
                ['cnhqcw==', 'cnhqcw==/7.999.0/dist/rxjs.js'],
                [
                    'QHlvdXdvbC9yeC12ZG9t',
                    'QHlvdXdvbC9yeC12ZG9t/1.0.1/dist/@youwol/rx-vdom.js',
                ],
            ],
            [
                [
                    'QHlvdXdvbC9yeC10cmVlLXZpZXdz',
                    'QHlvdXdvbC9yeC10cmVlLXZpZXdz/0.3.1/dist/@youwol/rx-tree-views.js',
                ],
            ],
        ],
    }
    shell$<Context>(new Context())
        .pipe(
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
        .subscribe((resp) => {
            expect(resp).toEqual(target)
            done()
        })
})
