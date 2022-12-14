import asyncio
import json
import os
import shutil
from pathlib import Path

import brotli
from starlette.middleware.base import RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from youwol.main_args import MainArguments
from youwol.routers.projects import ProjectLoader

from youwol_utils import execute_shell_cmd, sed_inplace, parse_json, Context, Label

from youwol.environment import Projects, System, Customization, CustomEndPoints, CloudEnvironments, DirectAuth, \
    LocalEnvironment, CustomMiddleware, FlowSwitcherMiddleware, CdnSwitch, \
    RemoteClients, Command, Configuration, YouwolEnvironment, LocalClients, CloudEnvironment, \
    get_standard_auth_provider, Connection, IConfigurationFactory
from youwol.pipelines.pipeline_typescript_weback_npm import lib_ts_webpack_template, app_ts_webpack_template


import youwol.pipelines.pipeline_typescript_weback_npm as pipeline_ts


async def clone_project(git_url: str, new_project_name: str, ctx: Context):
    folder_name = new_project_name.split("/")[-1]
    git_folder_name = git_url.split('/')[-1].split('.')[0]
    env = await ctx.get('env', YouwolEnvironment)
    parent_folder = env.pathsBook.config.parent / 'projects'
    dst_folder = parent_folder / folder_name
    await execute_shell_cmd(cmd=f"(cd {parent_folder} && git clone {git_url})",
                            context=ctx)
    if not (parent_folder / git_folder_name).exists():
        raise RuntimeError("Git repo not properly cloned")

    os.rename(parent_folder / git_folder_name, parent_folder / folder_name)
    old_project_name = parse_json(dst_folder / 'package.json')['name']
    sed_inplace(dst_folder / 'package.json', old_project_name, new_project_name)
    sed_inplace(dst_folder / 'index.html', old_project_name, new_project_name)
    return {}


async def purge_downloads(context: Context):
    async with context.start(action="purge_downloads", muted_http_errors={404}) as ctx:  # type: Context
        env: YouwolEnvironment = await ctx.get('env', YouwolEnvironment)
        assets_gtw = await RemoteClients.get_assets_gateway_client(
            remote_host=env.get_remote_info().host,
            context=ctx
        )
        headers = ctx.headers()
        default_drive = await LocalClients \
            .get_assets_gateway_client(env)\
            .get_treedb_backend_router() \
            .get_default_user_drive(headers=context.headers())
        treedb_client = assets_gtw.get_treedb_backend_router()
        resp = await treedb_client.get_children(
            folder_id=default_drive['downloadFolderId'],
            headers=headers
        )
        await asyncio.gather(
            *[treedb_client.remove_item(item_id=item["treeId"], headers=headers) for item in resp["items"]],
            *[treedb_client.remove_folder(folder_id=item["folderId"], headers=headers) for item in resp["folders"]]
        )
        await treedb_client.purge_drive(drive_id=default_drive['driveId'], headers=headers)
        return {}


async def reset(ctx: Context):
    env = await ctx.get('env', YouwolEnvironment)
    env.reset_cache()
    parent_folder = env.pathsBook.config.parent
    shutil.rmtree(parent_folder / "databases", ignore_errors=True)
    shutil.rmtree(parent_folder / "projects", ignore_errors=True)
    shutil.rmtree(parent_folder / "youwol_system", ignore_errors=True)
    os.mkdir(parent_folder / "projects")
    shutil.copytree(src=parent_folder / "empty_databases",
                    dst=parent_folder / "databases")
    await ProjectLoader.initialize(env=env)


async def create_test_data_remote(context: Context):
    async with context.start("create_new_story_remote") as ctx:
        env: YouwolEnvironment = await context.get('env', YouwolEnvironment)
        host = env.get_remote_info().host
        await ctx.info(f"selected Host for creation: {host}")
        folder_id = 'private_51c42384-3582-494f-8c56-7405b01646ad_default-drive_home'
        gtw = await RemoteClients.get_assets_gateway_client(remote_host=host, context=ctx)
        asset_resp = await gtw.get_assets_backend_router().create_asset(
            body={
                "rawId": "test-custom-asset",
                "kind": "custom-asset",
                "name": "Asset + files (remote test data in local-youwol-client)",
                "description": "A custom asset used to test posting files and auto-download of assets with files",
                "tags": ["integration-test", "local-youwol-client"]
            },
            params=[('folder-id', folder_id)],
            headers=ctx.headers()
        )
        data = open(Path(__file__).parent / 'test-add-files.zip', 'rb').read()
        upload_resp = await gtw.get_assets_backend_router().add_zip_files(
            asset_id=asset_resp["assetId"],
            data=data,
            headers=ctx.headers()
        )

        resp_stories = await gtw.get_stories_backend_router().create_story(
            body={
                "storyId": "504039f7-a51f-403d-9672-577b846fdbd8",
                "title": "Story (remote test data in local-youwol-client)"
            },
            params=[('folder-id', folder_id)],
            headers=ctx.headers()
        )

        resp_flux = await gtw.get_flux_backend_router().create_project(
            body={
                "projectId": "2d5cafa9-f903-4fa7-b343-b49dfba20023",
                "description": 'a flux project dedicated to test in http-clients',
                "name": "Flux-project (remote test data in local-youwol-client)"
            },
            params=[('folder-id', folder_id)],
            headers=ctx.headers()
        )

        content = json.dumps({'description': 'a file uploaded in remote env for test purposes (local-youwol-client)'})
        form = {
            'file': str.encode(content),
            'content_type': 'application/json',
            'file_id': "f72290f2-90bc-4192-80ca-20f983a1213d",
            'file_name': "Uploaded file (remote test data in local-youwol-client)"
        }
        resp_data = await gtw.get_files_backend_router().upload(
            data=form,
            params=[('folder-id', folder_id)],
            headers=ctx.headers()
        )
        resp = {
            "respCustomAsset": {
                "asset": asset_resp,
                "addFiles": upload_resp
            },
            "respStories": resp_stories,
            "respFlux": resp_flux,
            "respData": resp_data
        }
        await ctx.info(f"Story successfully created", data=resp)
        return resp


async def erase_all_test_data_remote(context: Context):

    async with context.start("erase_all_test_data_remote") as ctx:
        env: YouwolEnvironment = await context.get('env', YouwolEnvironment)
        host = env.get_remote_info().host
        await ctx.info(f"selected Host for deletion: {host}")
        drive_id = 'private_51c42384-3582-494f-8c56-7405b01646ad_default-drive'
        folder_id = f'{drive_id}_home'
        gtw = await RemoteClients.get_assets_gateway_client(remote_host=host, context=ctx)
        resp = await gtw.get_treedb_backend_router().get_children(folder_id=folder_id, headers=ctx.headers())
        await asyncio.gather(*[
            gtw.get_treedb_backend_router().remove_item(item_id=item['itemId'], headers=ctx.headers())
            for item in resp['items']
        ])
        await gtw.get_treedb_backend_router().purge_drive(drive_id=drive_id, headers=ctx.headers())
        return {"items": resp['items']}


class BrotliDecompressMiddleware(CustomMiddleware):

    """
        Simple middleware that logs incoming and outgoing headers
        """
    async def dispatch(
            self,
            incoming_request: Request,
            call_next: RequestResponseEndpoint,
            context: Context
    ):

        async with context.start(
                action="BrotliDecompressMiddleware.dispatch",
                with_labels=[Label.MIDDLEWARE]
        ) as ctx:  # type: Context

            response = await call_next(incoming_request)
            if response.headers.get('content-encoding') != 'br':
                return response
            await ctx.info(text="Got 'br' content-encoding => apply brotli decompresson")
            await context.info("Apply brotli decompression")
            binary = b''
            # noinspection PyUnresolvedReferences
            async for data in response.body_iterator:
                binary += data
            headers = {k: v for k, v in response.headers.items()
                       if k not in ['content-length', 'content-encoding']}
            decompressed = brotli.decompress(binary)
            resp = Response(decompressed.decode('utf8'), headers=headers)
            return resp


pipeline_ts.set_environment()


users = [
    (os.getenv("USERNAME_INTEGRATION_TESTS"), os.getenv("PASSWORD_INTEGRATION_TESTS")),
    (os.getenv("USERNAME_INTEGRATION_TESTS_BIS"), os.getenv("PASSWORD_INTEGRATION_TESTS_BIS"))
]
direct_auths = [DirectAuth(authId=email, userName=email, password=pwd)
                for email, pwd in users]

prod_env = CloudEnvironment(
    envId="prod",
    host="platform.youwol.com",
    authProvider=get_standard_auth_provider("platform.youwol.com"),
    authentications=direct_auths
)


async def test_command_post(body, context: Context):
    await context.info(text="test message", data={"body": body})
    return body["returnObject"]


class ConfigurationFactory(IConfigurationFactory):
    async def get(self, _main_args: MainArguments) -> Configuration:
        return Configuration(
            system=System(
                httpPort=2001,
                cloudEnvironments=CloudEnvironments(
                    defaultConnection=Connection(envId='prod', authId=direct_auths[0].authId),
                    environments=[prod_env]
                ),
                localEnvironment=LocalEnvironment(
                    dataDir=Path(__file__).parent / 'databases',
                    cacheDir=Path(__file__).parent / 'youwol_system'
                )
            ),
            projects=Projects(
                finder=Path(__file__).parent,
                templates=[
                    lib_ts_webpack_template(folder=Path(__file__).parent / 'projects'),
                    app_ts_webpack_template(folder=Path(__file__).parent / 'projects')
                ],
            ),
            customization=Customization(
                middlewares=[
                    FlowSwitcherMiddleware(
                        name="CDN live servers",
                        oneOf=[CdnSwitch(packageName="package-name", port=3006)],
                    ),
                    BrotliDecompressMiddleware()
                ],
                endPoints=CustomEndPoints(
                    commands=[
                        Command(
                            name="reset",
                            do_get=lambda ctx: reset(ctx)
                        ),
                        Command(
                            name="clone-project",
                            do_post=lambda body, ctx: clone_project(body['url'], body['name'], ctx)
                        ),
                        Command(
                            name="purge-downloads",
                            do_delete=lambda ctx: purge_downloads(ctx)
                        ),
                        Command(
                            name="create-test-data-remote",
                            do_get=lambda ctx: create_test_data_remote(ctx)
                        ),
                        Command(
                            name="erase_all_test_data_remote",
                            do_delete=lambda ctx: erase_all_test_data_remote(ctx)
                        ),
                        Command(
                            name="test-cmd-post",
                            do_post=lambda body, ctx: test_command_post(body, ctx)
                        ),
                        Command(
                            name="test-cmd-put",
                            do_put=lambda body, ctx: body["returnObject"]
                        ),
                        Command(
                            name="test-cmd-delete",
                            do_delete=lambda ctx: {"status": "deleted"}
                        ),
                    ]
                )
            )
        )