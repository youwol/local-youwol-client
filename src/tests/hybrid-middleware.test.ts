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
import { take, tap } from 'rxjs/operators'
import { ReplaySubject } from 'rxjs'
import { DownloadEvent } from '../lib/routers/system'

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

afterEach(() => resetTestCtxLabels())

test('can retrieve asset info when remote only', (done) => {
    class Context {
        // the creation of the test data is gathered in the youwol-config.py
        public readonly assetId = remoteStoryAssetId
    }
    const downloadEvents$ = new ReplaySubject<{ data: DownloadEvent }>()
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
            //expectDownloadEvents(remoteStoryAssetId, downloadEvents$),
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
        )
        .subscribe(() => {
            done()
        })
})
