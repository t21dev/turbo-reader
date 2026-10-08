//! The Turbo Reader skill: a `SKILL.md` that teaches an AI agent when and how
//! to use the MCP tools.
//!
//! The text ships inside the app, so the app always holds the newest copy. An
//! installed skill carries its version in the frontmatter. Two things keep
//! installed copies current: the skill tells the agent to call `get_skill`
//! with its version and replace itself when the app has a newer one, and the
//! app checks the copies it installed and offers an update in the bell.
//!
//! Nothing is installed until the user asks.

use serde::Serialize;
use std::path::{Path, PathBuf};

/// The skill's own version, shown in its frontmatter. Raised whenever its
/// text changes, and only then, so an app update that leaves the skill alone
/// does not nag anyone to update it.
pub const VERSION: &str = "1.0.0";

const TEMPLATE: &str = include_str!("../skill/SKILL.md");

/// The skill as it should be written to disk.
pub fn content() -> String {
    TEMPLATE.replace("{{VERSION}}", VERSION)
}

/// The version in a copy's frontmatter, if it has one.
pub fn version_of(text: &str) -> Option<String> {
    let rest = text.trim_start().strip_prefix("---")?;
    let front = rest.split("\n---").next()?;
    front
        .lines()
        .find_map(|l| l.trim().strip_prefix("version:"))
        .map(|v| v.trim().trim_matches('"').to_string())
        .filter(|v| !v.is_empty())
}

/// Dotted versions compared part by part: 1.10.0 is newer than 1.9.2.
pub fn is_older(installed: &str, than: &str) -> bool {
    let parts = |v: &str| -> Vec<u64> {
        v.split('.')
            .map(|p| p.trim().parse().unwrap_or(0))
            .collect()
    };
    let (a, b) = (parts(installed), parts(than));
    for i in 0..a.len().max(b.len()) {
        let (x, y) = (
            a.get(i).copied().unwrap_or(0),
            b.get(i).copied().unwrap_or(0),
        );
        if x != y {
            return x < y;
        }
    }
    false
}

/// An agent that reads skills from a folder in the user's home.
struct Agent {
    id: &'static str,
    label: &'static str,
    /// The agent's own folder, relative to home. Its presence means the
    /// agent is installed on this computer.
    root: &'static str,
}

const AGENTS: &[Agent] = &[
    Agent {
        id: "claude-code",
        label: "Claude Code",
        root: ".claude",
    },
    Agent {
        id: "codex",
        label: "Codex",
        root: ".codex",
    },
];

/// Home, or the folder tests point it at so they never touch the real one.
fn home() -> Option<PathBuf> {
    std::env::var_os("TURBO_SKILL_HOME")
        .map(PathBuf::from)
        .or_else(dirs::home_dir)
}

fn skill_file(home: &Path, agent: &Agent) -> PathBuf {
    home.join(agent.root)
        .join("skills")
        .join("turbo-reader")
        .join("SKILL.md")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub id: &'static str,
    pub label: &'static str,
    pub path: String,
    /// The agent is on this computer.
    pub detected: bool,
    /// The version installed there, or none when it is not installed.
    pub installed: Option<String>,
    pub current: &'static str,
    /// Installed, and older than the app's copy.
    pub outdated: bool,
}

pub fn status() -> Vec<Target> {
    // A Flatpak cannot see the agents' folders in home, so it offers only
    // the saved copy.
    if crate::flatpak_id().is_some() {
        return vec![];
    }
    let Some(home) = home() else { return vec![] };
    AGENTS
        .iter()
        .map(|a| {
            let file = skill_file(&home, a);
            let installed = std::fs::read_to_string(&file)
                .ok()
                // A copy with no version predates versioning: treat it as old.
                .map(|t| version_of(&t).unwrap_or_else(|| "0".into()));
            Target {
                id: a.id,
                label: a.label,
                path: file.display().to_string(),
                detected: home.join(a.root).is_dir(),
                outdated: installed.as_deref().is_some_and(|v| is_older(v, VERSION)),
                installed,
                current: VERSION,
            }
        })
        .collect()
}

fn agent(id: &str) -> Result<&'static Agent, String> {
    AGENTS
        .iter()
        .find(|a| a.id == id)
        .ok_or_else(|| format!("Unknown agent: {id}"))
}

/// Write the current skill for an agent, creating its skills folder.
pub fn install(id: &str) -> Result<(), String> {
    let home = home().ok_or("Could not find your home folder.")?;
    let file = skill_file(&home, agent(id)?);
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    std::fs::write(&file, content()).map_err(|e| format!("{}: {e}", file.display()))
}

/// Remove the skill, and its folder when nothing else is in it. Only ever
/// touches the `turbo-reader` folder this app created.
pub fn remove(id: &str) -> Result<(), String> {
    let home = home().ok_or("Could not find your home folder.")?;
    let file = skill_file(&home, agent(id)?);
    match std::fs::remove_file(&file) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("{}: {e}", file.display())),
    }
    if let Some(dir) = file.parent() {
        let _ = std::fs::remove_dir(dir);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_carries_its_version_everywhere() {
        let c = content();
        assert!(!c.contains("{{VERSION}}"));
        assert_eq!(version_of(&c).as_deref(), Some(VERSION));
        assert!(c.contains("name: turbo-reader"));
        assert!(c.contains(&format!(r#"{{"version": "{VERSION}"}}"#)));
    }

    #[test]
    fn reads_the_version_from_the_frontmatter_only() {
        let a = "---\nname: x\nversion: 1.2.0\n---\nbody";
        let b = "---\nversion: \"2.0.0\"\n---\n";
        let c = "---\nname: x\n---\nversion: 9.9.9";
        assert_eq!(version_of(a).as_deref(), Some("1.2.0"));
        assert_eq!(version_of(b).as_deref(), Some("2.0.0"));
        assert_eq!(version_of(c), None);
        assert_eq!(version_of("no frontmatter"), None);
    }

    #[test]
    fn compares_versions_part_by_part() {
        assert!(is_older("1.9.2", "1.10.0"));
        assert!(is_older("0", "1.0.0"));
        assert!(!is_older("1.0.0", "1.0.0"));
        assert!(!is_older("2.0.0", "1.9.9"));
        assert!(!is_older("1.0", "1.0.0"));
    }
}
