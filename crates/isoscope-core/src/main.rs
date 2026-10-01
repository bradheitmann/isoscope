use clap::{Parser, Subcommand};
use isoscope_core::{
    github, graph,
    model::{Config, Raw},
    server, store,
};
use std::{fs, path::PathBuf};
#[derive(Parser)]
#[command(version, about = "Isoscope Rust forge workflow and graph engine")]
struct Cli {
    #[arg(long, default_value = "replacement/state", global = true)]
    state: PathBuf,
    #[arg(long, default_value = "replacement/leitting.json", global = true)]
    config: PathBuf,
    #[command(subcommand)]
    command: Action,
}
#[derive(Subcommand)]
enum Action {
    Mcp,
    Refresh,
    Replay {
        receipt: PathBuf,
    },
    Snapshot,
    Serve {
        #[arg(long, default_value = "replacement/web/dist")]
        assets: PathBuf,
        #[arg(long, default_value_t = 4185)]
        port: u16,
    },
    Graph {
        #[command(subcommand)]
        action: graph::Action,
    },
}
fn run() -> Result<(), String> {
    let cli = Cli::parse();
    let root = std::env::current_dir().map_err(|e| e.to_string())?;
    let state = store::isolated_state(&root, &cli.state)?;
    match cli.command {
        Action::Mcp => isoscope_core::mcp::serve(&state),
        Action::Serve { assets, port } => server::serve(&state, &assets, port),
        Action::Snapshot => {
            println!(
                "{}",
                serde_json::to_string_pretty(&store::read_snapshot(&state)?)
                    .map_err(|e| e.to_string())?
            );
            Ok(())
        }
        Action::Graph { action } => graph::run(&state, action),
        Action::Refresh | Action::Replay { .. } => {
            let _lock = store::RefreshLock::acquire(&state)?;
            if matches!(cli.command, Action::Refresh) && !store::retry_due(&state) {
                println!(
                    "{}",
                    serde_json::json!({"result":"skipped","reason":"bounded source-failure backoff"})
                );
                return Ok(());
            }
            let config: Config =
                serde_json::from_slice(&fs::read(cli.config).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            let result = match cli.command {
                Action::Replay { receipt } => {
                    let raw: Raw =
                        serde_json::from_slice(&fs::read(receipt).map_err(|e| e.to_string())?)
                            .map_err(|e| e.to_string())?;
                    store::publish(&state, &raw, &config)
                }
                _ => github::collect(&config).and_then(|raw| store::publish(&state, &raw, &config)),
            };
            match result {
                Ok(snapshot) => {
                    println!(
                        "{}",
                        serde_json::json!({"repository":snapshot.repository,"collected_at":snapshot.collected_at,"items":snapshot.items.len(),"plan_commit":snapshot.plan_commit,"sha256":snapshot.content_sha256,"result":"success"})
                    );
                    Ok(())
                }
                Err(e) => {
                    store::fail(&state, &e)?;
                    Err(e)
                }
            }
        }
    }
}
fn main() {
    if let Err(e) = run() {
        eprintln!("{e}");
        std::process::exit(1);
    }
}
