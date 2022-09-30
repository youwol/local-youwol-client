// eslint-disable-next-line eslint-comments/disable-enable-pair -- to not have problem
/* eslint-disable jest/no-done-callback -- eslint-comment It is required because */
import { Test } from '@youwol/http-clients'
Test.mockRequest()

import { remoteStoryAssetId } from './remote_assets_id'
import { setup$ } from '../lib'

beforeEach((done) => {
    setup$({
        localOnly: false,
        email: 'int_tests_yw-users@test-user',
    }).subscribe(() => {
        done()
    })
})

test('can retrieve asset info when remote only', (done) => {
    class Context {
        // the creation of the test data is gathered in the youwol-config.py
        public readonly assetId = remoteStoryAssetId
    }

    Test.shell$<Context>(new Context())
        .pipe(
            Test.AssetsBackend.getAsset({
                inputs: (shell: Test.Shell<Context>) => {
                    return {
                        assetId: shell.context.assetId,
                    }
                },
                sideEffects: (response, shell) => {
                    expect(response.assetId).toBe(shell.context.assetId)
                },
            }),
            Test.AssetsBackend.getPermissions({
                inputs: (shell) => {
                    return {
                        assetId: shell.context.assetId,
                    }
                },
                sideEffects: (response) => {
                    expect(response.write).toBeTruthy()
                    expect(response.read).toBeTruthy()
                    expect(response.share).toBeTruthy()
                },
            }),
        )
        .subscribe(() => {
            done()
        })
})
