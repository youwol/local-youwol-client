// eslint-disable-next-line eslint-comments/disable-enable-pair -- Don't know why this very line is needed
/* eslint-disable jest/no-done-callback -- eslint-comment Find a good way to work with rxjs in jest */
import { from, Observable, ReplaySubject } from 'rxjs'
import { PyYouwolClient } from '../lib'
import { DownloadEvent } from '../lib/routers/system'
import { mergeMap, tap } from 'rxjs/operators'
import { install, State } from '@youwol/cdn-client'
import {
    GetCdnStatusResponse,
    ResetCdnResponse,
} from '../lib/routers/local-cdn'
import {
    addBookmarkLog,
    expectDownloadEvents,
    getCdnStatus,
    resetCdn,
    Shell,
    shell$,
    testSetup$,
    testTearDown$,
} from './shell'

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

function testDownloadPackage<TContext>(
    module: string,
    expectedStatus: 'succeeded' | 'failed' = 'succeeded',
) {
    const downloadEvents$ = new ReplaySubject<{ data: DownloadEvent }>()
    const assetId = window.btoa(window.btoa(module.split('#')[0]))
    return (obs: Observable<Shell<TContext>>) => {
        return obs.pipe(
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
            addBookmarkLog({ text: `Install module ${module}` }),
            mergeMap((shell) => {
                return from(
                    install({
                        modules: [module],
                    }).then(() => shell),
                )
            }),
            expectDownloadEvents(assetId, downloadEvents$, expectedStatus),
        )
    }
}

// eslint-disable-next-line jest/expect-expect -- expects are factorized in test_download_asset
test('install package rxjs', (done) => {
    class Context {}
    return shell$<Context>(new Context())
        .pipe(
            // ensure shell's tearDown in 'afterEach'
            tap((shell) => (currentShell = shell)),
            testDownloadPackage('rxjs'),
        )
        .subscribe(() => done())
})

// eslint-disable-next-line jest/expect-expect -- expects are factorized in test_download_asset
test('install package @youwol/logging#0.0.2-next => Failure', (done) => {
    class Context {}
    return shell$<Context>(new Context())
        .pipe(
            // ensure shell's tearDown in 'afterEach'
            tap((shell) => (currentShell = shell)),
            testDownloadPackage('@youwol/logging#0.0.2-next', 'failed'),
        )
        .subscribe(() => done())
})

test(
    'install package rxjs + clear + install package rxjs',
    (done) => {
        class Context {}
        return shell$<Context>(new Context())
            .pipe(
                // ensure shell's tearDown in 'afterEach'
                tap((shell) => (currentShell = shell)),
                testDownloadPackage('rxjs', 'succeeded'),
                addBookmarkLog({ text: `Reset CDN` }),
                resetCdn({
                    sideEffects: (resp: ResetCdnResponse) => {
                        expect(resp.deletedPackages).toEqual(['rxjs'])
                        State.resetCache()
                    },
                }),
                getCdnStatus({
                    sideEffects: (resp: GetCdnStatusResponse) => {
                        expect(resp.packages).toHaveLength(0)
                    },
                }),
                addBookmarkLog({ text: `Download RxJS again` }),
                testDownloadPackage('rxjs', 'succeeded'),
            )
            .subscribe(() => {
                done()
            })
    },
    20 * 1000,
)

// eslint-disable-next-line jest/expect-expect -- expects are factorized in test_download_asset
test(
    'version resolution if other majors already downloaded',
    (done) => {
        // coming from https://tooling.youwol.com/taiga/project/pyyouwol/issue/1203
        const downloadEvents1$ = new ReplaySubject<{ data: DownloadEvent }>()
        const downloadEvents2$ = new ReplaySubject<{ data: DownloadEvent }>()
        const rawId = 'QHlvdXdvbC9jZG4tY2xpZW50'
        const assetId = window.btoa(rawId)
        class Context {}
        return shell$<Context>(new Context())
            .pipe(
                tap((shell) => {
                    currentShell = shell
                    shell.addSubscription(
                        'downloadEvents_^1.0.0',
                        pyYouwol.admin.system.webSocket
                            .downloadEvent$()
                            .subscribe((d) => downloadEvents1$.next(d)),
                    )
                }),
                addBookmarkLog({ text: `fetch script ^1.0.0` }),
                mergeMap((shell) => {
                    return from(
                        fetch(
                            `/api/assets-gateway/raw/package/${rawId}/^1.0.0/dist/@youwol/cdn-client.js`,
                        ).then(() => shell),
                    )
                }),
                expectDownloadEvents(assetId, downloadEvents1$, 'succeeded'),
                addBookmarkLog({ text: `^1.0.0 succeeded` }),
                tap((shell) => {
                    downloadEvents1$.complete()
                    shell.addSubscription(
                        'downloadEvents_^2.0.0',
                        pyYouwol.admin.system.webSocket
                            .downloadEvent$()
                            .subscribe((d) => downloadEvents2$.next(d)),
                    )
                }),
                addBookmarkLog({ text: `fetch script ^2.0.0` }),
                mergeMap((shell) => {
                    return from(
                        fetch(
                            `/api/assets-gateway/raw/package/${rawId}/^2.0.0/dist/@youwol/cdn-client.js`,
                        ).then(() => shell),
                    )
                }),
                expectDownloadEvents(assetId, downloadEvents2$, 'succeeded'),
                addBookmarkLog({ text: `^2.0.0 succeeded` }),
            )
            .subscribe(() => {
                done()
            })
    },
    20 * 1000,
)
