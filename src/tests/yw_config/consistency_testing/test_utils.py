import asyncio
import itertools
import shutil
import tempfile
import time
import zipfile
from signal import SIGKILL
from typing import AsyncContextManager, Union, NamedTuple, List, Callable, Tuple, Awaitable, cast, Optional
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import aiohttp
import psutil
from colorama import init as colorama_init
from colorama import Fore
from colorama import Style
import websockets
from psutil import process_iter
from websockets.exceptions import InvalidMessage

import youwol
from youwol.environment import configuration_from_python, RemoteClients, default_auth_provider, AuthorizationProvider, \
    Configuration
from youwol.routers.system.router import Log, NodeLogResponse, LeafLogResponse
from youwol_utils import execute_shell_cmd, Context, ContextReporter, LogEntry, parse_json, write_json, OidcConfig

colorama_init()


class Reporter(ContextReporter):
    async def log(self, entry: LogEntry):
        if entry.text != '\n':
            print(entry.text.replace('\n', ''))


context = Context(
    logs_reporters=[Reporter()],
    data_reporters=[]
)
no_log_context = Context(
    logs_reporters=[],
    data_reporters=[]
)


async def wait_py_youwol_ready(port: int):
    async def handler(websocket):
        await websocket.recv()

    while True:
        try:
            async with websockets.connect(f'ws://localhost:{port}/ws-data') as ws:
                await handler(ws)
            break
        except (ConnectionRefusedError, InvalidMessage):
            pass


def stop_py_youwol(port: int):
    for proc in process_iter():
        try:
            for conns in proc.connections(kind='inet'):
                if conns.laddr.port == port:
                    proc.send_signal(SIGKILL)  # or SIGKILL
        except (PermissionError, psutil.AccessDenied):
            pass


class PyYouwolSession(NamedTuple):
    configuration: Configuration


@asynccontextmanager
async def py_youwol_session(config_path: Union[Path, str]) -> AsyncContextManager[PyYouwolSession]:

    config = await configuration_from_python(Path(config_path))
    port = config.system.httpPort

    asyncio.ensure_future(execute_shell_cmd(
        cmd=f"python {youwol.__path__[0]}/main.py --conf={config_path}",
        context=no_log_context
    ))
    try:
        await wait_py_youwol_ready(port=port)
        yield PyYouwolSession(configuration=config)
    finally:
        stop_py_youwol(port=port)


class TestFailureResult(NamedTuple):
    name: List[str]
    logs: Awaitable[List[Log]]
    output_summary: List[str]


RunId = str


class Publication(NamedTuple):
    remote_host: str
    client_id: str
    client_secret: str


class TestSession:
    result_folder: Path
    session_id: str
    publication: Publication
    asset_id: Optional[str] = None

    def __init__(self, result_folder: Path, publication: Publication):
        self.result_folder = result_folder
        self.result_folder.mkdir()
        self.summary_path = self.result_folder / 'summary.json'
        self.summary_path.write_text('{"results":[]}')
        self.session_id = str(datetime.now())
        self.publication = publication

    async def create_asset(self):
        gtw = await RemoteClients.get_assets_gateway_client(remote_host=self.publication.remote_host)
        headers = await get_headers(self.publication)
        default_drive = await gtw.get_treedb_backend_router().get_default_user_drive(headers=headers)
        asset_resp = await gtw.get_assets_backend_router().create_asset(
            body={
                "rawId": self.session_id,
                "kind": "py-youwol-consistency-testing",
                "name": f"Consistency_{self.session_id}.tests",
                "description": "Logs of IT executed with py-youwol",
                "tags": ["py-youwol", "test", "logs"]
            },
            params=[('folder-id', default_drive['homeFolderId'])],
            headers=headers
        )
        self.asset_id = asset_resp["assetId"]
        print("Asset created successfully", asset_resp)

    async def execute(self,
                      py_yw_session: PyYouwolSession,
                      title: str,
                      action: Callable[[], Awaitable[Tuple[int, List[str]]]],
                      errors_formatter: Callable[[PyYouwolSession, List[str]], Awaitable[List[TestFailureResult]]]):

        if not self.asset_id:
            await self.create_asset()

        run_id = str(datetime.now())
        start = time.time()
        return_code, outputs = await action()
        end = time.time()
        data = parse_json(self.summary_path)
        to_publish = []
        if return_code != 0:
            print(f"{Fore.RED}ERROR while executing test{Style.RESET_ALL}")

            errors = await errors_formatter(py_yw_session, outputs)

            def to_logs_path(err):
                return self.result_folder / f"logs_{'_'.join(err.name + [run_id])}.json"

            for error in errors:
                logs = await error.logs
                logs_path = to_logs_path(error)
                write_json(
                    data={"nodes": [log.dict() for log in logs]},
                    path=logs_path
                )
                to_publish.append(logs_path.name)

            filename = f'full_outputs{run_id}.txt'
            to_publish.append(filename)
            data['results'].append({
                "runId": run_id,
                "title": title,
                "status": "KO",
                "executionDate": run_id,
                "duration": end - start,
                "fullOutput": filename,
                "errors": [{
                    "name": error.name,
                    "outputSummary": error.output_summary,
                    "logsFile": str(to_logs_path(error).relative_to(self.result_folder))
                } for error in errors]
            })

            Path(self.result_folder / filename).write_text(''.join(outputs))
            print(f"Error writen in {filename}")
        else:
            data['results'].append({
                "title": title,
                "status": "OK",
                "executionDate": run_id,
                "duration": end - start
            })
            print(f"{Fore.GREEN}SUCCESS while executing test{Style.RESET_ALL}")
        write_json(data, self.summary_path)
        to_publish.append(self.summary_path.name)
        await publish_files(
            result_folder=self.result_folder,
            files=to_publish,
            asset_id=self.asset_id,
            publication=self.publication
        )
        return return_code, outputs


async def get_headers(publication: Publication):
    auth_provider = AuthorizationProvider(**default_auth_provider(platform_host=publication.remote_host))
    token = await OidcConfig(auth_provider.openidBaseUrl).for_client(auth_provider.openidClient).direct_flow(
        username=publication.client_id,
        password=publication.client_secret
    )
    return {'authorization': f'Bearer {token["access_token"]}'}


async def publish_files(result_folder: Path, files: List[str], asset_id: str, publication: Publication):
    with tempfile.TemporaryDirectory() as tmp_folder:
        base_path = Path(tmp_folder)
        files = [x for x in files]
        zipper = zipfile.ZipFile(base_path / 'asset.zip', 'w', zipfile.ZIP_DEFLATED)
        for file in files:
            shutil.copy(result_folder / file, base_path / file)
            zipper.write(base_path / file, arcname=file)

        zipper.close()
        data = (Path(tmp_folder) / "asset.zip").read_bytes()

    gtw = await RemoteClients.get_assets_gateway_client(remote_host=publication.remote_host)
    headers = await get_headers(publication)

    upload_resp = await gtw.get_assets_backend_router().add_zip_files(
        asset_id=asset_id,
        data=data,
        headers=headers
    )
    print("Files uploaded", upload_resp)


async def yarn_errors_formatter(py_yw_session: PyYouwolSession, outputs: List[str]) -> List[TestFailureResult]:

    lines = itertools.chain.from_iterable(line.split('\n') for line in outputs)
    lines = [line for line in lines if line != '']
    test_suites_failed = [i for i, line in enumerate(lines) if 'FAIL src/tests/' in line] + [len(lines)]
    http_port = py_yw_session.configuration.system.httpPort

    async def get_logs(body):
        async with aiohttp.ClientSession() as session:
            async with session.post(url=f"http://localhost:{http_port}/admin/custom-commands/get-logs",
                                    json=body) as resp:
                json_resp = await resp.json()
                nodes = cast(List[Log], [NodeLogResponse(**node) for node in json_resp['nodes']])
                leafs = cast(List[Log], [LeafLogResponse(**leaf) for leaf in json_resp['leafs']])
                return list(sorted(nodes+leafs, key=lambda n: n.timestamp))

    def extract_test_suite(test_file, chunk):
        test_name = chunk[0].split('● ')[1]
        return TestFailureResult(
            name=[test_file.split('/')[-1], test_name],
            logs=get_logs({"testName": test_name, "file": test_file}),
            output_summary=chunk
        )

    def extract_test_file(start, end):
        lines_test = lines[start:end]
        starts = [i for i, line in enumerate(lines_test) if '●' in line and 'Console' not in line]
        chunks = [lines_test[i:i+15] for i in starts]
        test_file = lines_test[0].split(" ")[1]
        return test_file, chunks

    file_results = [extract_test_file(start, end)
                    for start, end in zip(test_suites_failed[0:-1], test_suites_failed[1:])]
    return [extract_test_suite(test_file, chunk)
            for test_file, test_results in file_results
            for chunk in test_results]