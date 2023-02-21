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

test('install package rxjs + clear + install package rxjs', (done) => {
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
})
