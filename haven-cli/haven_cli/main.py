"""Main CLI entry point for Haven."""

import typer
from rich.console import Console

from haven_cli import __app_name__, __version__
from haven_cli.cli import config, download, jobs, plugins, run, upload

app = typer.Typer(
    name=__app_name__,
    help="Haven CLI - Event-driven data pipeline for media archival and processing.",
    add_completion=True,
    no_args_is_help=True,
)

console = Console()

# Register command groups
app.add_typer(run.app, name="run")
app.add_typer(upload.app, name="upload")
app.add_typer(download.app, name="download")
app.add_typer(jobs.app, name="jobs")
app.add_typer(plugins.app, name="plugins")
app.add_typer(config.app, name="config")


def version_callback(value: bool) -> None:
    """Print version and exit."""
    if value:
        console.print(f"{__app_name__} v{__version__}")
        raise typer.Exit()


@app.callback()
def main(
    version: bool = typer.Option(
        False,
        "--version",
        "-v",
        help="Show version and exit.",
        callback=version_callback,
        is_eager=True,
    ),
) -> None:
    """Haven CLI - Event-driven data pipeline for media archival and processing."""
    pass


if __name__ == "__main__":
    app()
