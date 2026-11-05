#!/usr/bin/env bash
# Open the mdhouse AI team in Kitty; launchers own identity, resume and live-name protection.
set -euo pipefail

team_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
plans_dir=$(cd -- "$team_dir/.." && pwd -P)
repo_dir=$(git -C "$plans_dir" rev-parse --show-toplevel)
run=0
roles=0
kitty_socket=${KITTY_LISTEN_ON:-}

usage() {
    cat <<'EOF'
Usage: start-agents.sh [--run] [--roles] [--to KITTY_SOCKET]

Without --run, show help, Kitty availability and current team status only.

Open six Kitty tabs, each in its own Plans/ai-team/<role>/ starting directory:
  MDH-CEO     #cx/mdhouse-ceo       ab-codex
  MDH-CTO     #cx/mdhouse-cto       ab-codex
  MDH-W1      #cl/mdhouse-w1        ab-claude
  MDH-W2      #cl/mdhouse-w2        ab-claude -2
  MDH-W3      #cx/mdhouse-w3        ab-codex
  MDH-Review  #oc/mdhouse-review    ab-opencode

All sessions use --tag mdhouse and an explicit AGENT_BUS_NAME.
All sessions receive KITTY_LISTEN_ON so CTO can read tab status lines.
With --run, an unavailable socket starts a detached Kitty with remote control,
then the team starts inside it. Without --run, no windows or agents are started.
Existing conversations resume through ab-*; live names are never taken over.
Active team roles are kept; --run opens tabs only for missing roles.

  --run              Open tabs for missing team roles; each new session is told
                     to read its role and its one-line answer is printed
  --roles            Tell every active team session to read its role again
  --to KITTY_SOCKET  Target a Kitty remote-control socket
  -h, --help         Show this help and current team status
EOF
}

while (($#)); do
    case "$1" in
        --run) run=1; shift ;;
        --roles) roles=1; shift ;;
        --to)
            if (($# < 2)) || [[ -z $2 ]]; then
                echo 'start-agents: --to requires a Kitty socket' >&2
                exit 64
            fi
            kitty_socket=$2
            shift 2
            ;;
        -h|--help) run=0; shift ;;
        *) echo "start-agents: unknown option: $1" >&2; usage >&2; exit 64 ;;
    esac
done

kitty_args=(@ --to "$kitty_socket")

if (( ! run )); then
    usage
    printf '\n'
fi

kitty_ready=0
if ! command -v kitty >/dev/null 2>&1; then
    echo 'Kitty: not installed; install Kitty before starting the team.'
elif [[ -z $kitty_socket ]]; then
    echo 'Kitty: no socket configured (KITTY_LISTEN_ON is empty).'
    echo 'Use --run to open a detached Kitty with a socket, or --to for an existing socket.'
elif kitty "${kitty_args[@]}" ls >/dev/null 2>&1; then
    printf 'Kitty: remote control ready (%s).\n' "$kitty_socket"
    kitty_ready=1
else
    printf 'Kitty: socket unavailable (%s); check Kitty and remote control, or pass --to KITTY_SOCKET.\n' "$kitty_socket"
fi

for executable in agent-bus jq; do
    if ! command -v "$executable" >/dev/null 2>&1; then
        echo "start-agents: missing command: $executable" >&2
        exit 69
    fi
done

agents=$(agent-bus ls --tag mdhouse)
expected_names=(
    '#cx/mdhouse-ceo'
    '#cx/mdhouse-cto'
    '#cl/mdhouse-w1'
    '#cl/mdhouse-w2'
    '#cx/mdhouse-w3'
    '#oc/mdhouse-review'
)

is_active() {
    local name=$1
    jq -e --arg name "$name" \
        'any(.[]; (.name == $name) or (.name | startswith($name + "@")))' \
        <<< "$agents" >/dev/null
}

# A launched session reads its AGENTS.md only when asked, so tell each one once
# its bus name is live.
role_message() {
    local role=$1
    printf 'Read your role now: Plans/ai-team/%s/AGENTS.md, then the role file it links (Plans/ai-team/%s.md) and every shared rule it links (Plans/ai-team/common.md, README.md). Follow them from now on. Reply with one line: your role and its first duty. Do not start a task because of this message.' "$role" "$role"
}

tell_role() {
    local role=$1 name=$2 answer
    # One tag per session: parallel calls sharing a tag can take each other's answers.
    if answer=$(agent-bus call --wait=120s --topic=role --tag="mdhouse-role-$role" "$name" "$(role_message "$role")" 2>&1); then
        printf '%s\n' "$(jq -r '"\(.from // "?"): \(.body // .)"' <<< "$answer" 2>/dev/null || printf '%s: %s' "$name" "$answer")"
    else
        printf 'start-agents: %s did not confirm its role: %s\n' "$name" "$answer" >&2
        return 1
    fi
}

# Wait until each started session is live, then have it read its role and
# print its one-line answer.
tell_roles() {
    local pending=("$@") waiting deadline=$((SECONDS + 120)) entry pids=() failed=0
    while ((${#pending[@]})) && ((SECONDS < deadline)); do
        agents=$(agent-bus ls --tag mdhouse)
        waiting=()
        for entry in "${pending[@]}"; do
            if is_active "${entry#*:}"; then
                tell_role "${entry%%:*}" "${entry#*:}" & pids+=($!)
            else
                waiting+=("$entry")
            fi
        done
        pending=("${waiting[@]}")
        ((${#pending[@]})) && sleep 3
    done
    for entry in "${pending[@]}"; do
        printf 'start-agents: %s not live after 120s; run start-agents.sh --roles once it is.\n' "${entry#*:}" >&2
        failed=1
    done
    for pid in "${pids[@]}"; do wait "$pid" || failed=1; done
    return "$failed"
}

missing=0
for name in "${expected_names[@]}"; do
    if ! is_active "$name"; then
        ((missing += 1))
    fi
done

if jq -e 'length > 0' <<< "$agents" >/dev/null; then
    echo 'Active mdhouse-tagged agents:'
    jq -r '.[] | "\(.name) — \(.descr // "")"' <<< "$agents"
else
    echo 'No active mdhouse-tagged agents.'
fi

printf 'Team roles: %d active, %d missing.\n' "$(( ${#expected_names[@]} - missing ))" "$missing"
roles_of=(ceo cto w1 w2 w3 review)
if (( roles )); then
    active=()
    for i in "${!expected_names[@]}"; do
        is_active "${expected_names[i]}" && active+=("${roles_of[i]}:${expected_names[i]}")
    done
    if ((${#active[@]} == 0)); then
        echo 'No active team session to tell.'
    else
        tell_roles "${active[@]}" || status=1
    fi
    (( run )) || exit "${status:-0}"
fi
if (( ! run )); then
    exit 0
fi
if (( missing == 0 )); then
    echo 'All mdhouse team roles are active; no tabs opened.'
    exit 0
fi

for role in ceo cto w1 w2 w3 review; do
    if [[ ! -f "$team_dir/$role/AGENTS.md" ]]; then
        echo "start-agents: missing role directory/instructions: Plans/ai-team/$role" >&2
        exit 69
    fi
done

for executable in kitty ab-codex ab-claude ab-opencode; do
    if ! command -v "$executable" >/dev/null 2>&1; then
        echo "start-agents: missing command: $executable" >&2
        exit 69
    fi
done

if (( ! kitty_ready )); then
    if [[ ${MDHOUSE_KITTY_BOOTSTRAPPED:-0} == 1 ]]; then
        echo 'start-agents: new Kitty did not provide a working socket; check remote control.' >&2
        exit 69
    fi
    if [[ -z ${DISPLAY:-} && -z ${WAYLAND_DISPLAY:-} ]]; then
        echo 'start-agents: no graphical display; run from a desktop session or pass --to.' >&2
        exit 69
    fi
    new_socket="unix:${XDG_RUNTIME_DIR:-/tmp}/mdhouse-kitty-$UID"
    echo 'Opening detached Kitty; the team will start inside it.'
    exec env -u KITTY_LISTEN_ON MDHOUSE_KITTY_BOOTSTRAPPED=1 kitty --detach \
        --listen-on "$new_socket" -o allow_remote_control=socket-only \
        --directory "$repo_dir" "$team_dir/start-agents.sh" --run
fi

launch_agent() {
    local role=$1 title=$2 name=$3 description=$4 launcher=$5
    shift 5
    if is_active "$name"; then
        printf 'Keeping %s (%s): already active.\n' "$title" "$name"
        return
    fi
    local launcher_path
    launcher_path=$(command -v "$launcher")
    local command=(kitty "${kitty_args[@]}" launch --type=tab
        --tab-title "$title" --title "$title" --cwd "$team_dir/$role"
        --env "AGENT_BUS_NAME=$name"
        --env "KITTY_LISTEN_ON=$kitty_socket"
        "$launcher_path" "$@" --tag mdhouse --descr "$description")

    printf 'Starting %s (%s)\n' "$title" "$name"
    "${command[@]}"
    started+=("$role:$name")
}

started=()

launch_agent ceo MDH-CEO '#cx/mdhouse-ceo' 'mdhouse CEO — product and coordination' ab-codex
launch_agent cto MDH-CTO '#cx/mdhouse-cto' 'mdhouse CTO — technical direction' ab-codex
launch_agent w1 MDH-W1 '#cl/mdhouse-w1' 'mdhouse worker 1 — server, access and security' ab-claude
launch_agent w2 MDH-W2 '#cl/mdhouse-w2' 'mdhouse worker 2 — UI, editing and mobile, Claude account 2' ab-claude -2
launch_agent w3 MDH-W3 '#cx/mdhouse-w3' 'mdhouse worker 3 — implementation, Codex' ab-codex
launch_agent review MDH-Review '#oc/mdhouse-review' 'mdhouse independent code review' ab-opencode
(( ${#started[@]} )) && tell_roles "${started[@]}"
