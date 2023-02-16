# From the yw_config folder, run:
# python -m consistency_testing.main
# Following environment variables are required:
# USERNAME_INTEGRATION_TESTS PASSWORD_INTEGRATION_TESTS USERNAME_INTEGRATION_TESTS_BIS PASSWORD_INTEGRATION_TESTS_BIS
#
# The code in './test_utils' are meant to be factorized at some point, likely in youwol_utils.
#
import asyncio
import os
from datetime import datetime
from pathlib import Path
from typing import NamedTuple

from colorama import Fore, Style

from youwol_utils import execute_shell_cmd, ContextReporter, LogEntry, Context
from .test_utils import TestSession, py_youwol_session, yarn_errors_formatter, Publication


class Reporter(ContextReporter):
    async def log(self, entry: LogEntry):
        if entry.text != '\n':
            print(entry.text.replace('\n', ''))


context = Context(
    logs_reporters=[Reporter()],
    data_reporters=[]
)


class Counter(NamedTuple):
    OK: int = 0
    KO: int = 0

    def with_ok(self):
        return Counter(OK=self.OK+1, KO=self.KO)

    def with_ko(self):
        return Counter(OK=self.OK, KO=self.KO+1)

    def __str__(self):
        return f"Current status: {Fore.GREEN}{self.OK} OK, {Fore.RED}{self.KO} KO{Style.RESET_ALL}"


async def execute():

    count = 100

    consistency_testing = TestSession(
        result_folder=Path(f'./test_stability_{datetime.now()}'),
        publication=Publication(
            remote_host="platform.youwol.com",
            client_id=os.getenv("USERNAME_INTEGRATION_TESTS"),
            client_secret=os.getenv("PASSWORD_INTEGRATION_TESTS")
        )
    )
    counter = Counter()

    for i in range(count):
        print(f"Running {i}/{count}")
        async with py_youwol_session(config_path='./yw_config.py') as py_yw_session:

            return_code, output = await consistency_testing.execute(
                py_yw_session=py_yw_session,
                title="yarn test",
                action=lambda: execute_shell_cmd(
                    cmd="(cd ../.. & yarn test )",
                    context=context
                ),
                errors_formatter=yarn_errors_formatter
            )
            counter = counter.with_ok() if return_code == 0 else counter.with_ko()
            print(counter)

asyncio.run(execute())
