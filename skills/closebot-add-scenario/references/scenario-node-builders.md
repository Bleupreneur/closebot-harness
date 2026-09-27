# closebot-add-scenario — node builders

All four snippets assume `steps.json` was produced by `cb bot pull <id> --out
steps.json`, and that `SCENARIO_ID`/`TAG_ID`/`END_ID` were generated with:
```bash
SCENARIO_ID="node_$(uuidgen | tr -d '-' | cut -c1-16 | tr '[:upper:]' '[:lower:]')"
TAG_ID="node_$(uuidgen | tr -d '-' | cut -c1-16 | tr '[:upper:]' '[:lower:]')"
END_ID="node_$(uuidgen | tr -d '-' | cut -c1-16 | tr '[:upper:]' '[:lower:]')"
```

## Standard pairings

| Scenario | Recommended response chain |
|---|---|
| Aggression | → `ModifyTags` (add "needs-human-handover" + "ai-aggression-detected") → `End` |
| Bot Detection | → `End` silently (don't waste tokens replying to bots) |
| Goodbye | → `Statement` (brand-appropriate signoff) → `End` |
| Custom | → whatever the user designs |

## A. Aggression scenario

```bash
HANDOVER_TAG="needs-human-handover"; AGGRESSION_TAG="ai-aggression-detected"
jq --arg sid "$SCENARIO_ID" --arg tid "$TAG_ID" --arg eid "$END_ID" \
   --arg htag "$HANDOVER_TAG" --arg atag "$AGGRESSION_TAG" '
  .nodes += [
    {"id":$sid,"type":"ScenarioAggression","data":{"Title":"Aggression Detected"},"position":{"x":-200,"y":-200}},
    {"id":$tid,"type":"ModifyTags","data":{"Title":"Tag aggression handover","TagsToAdd":[{"Tag":$htag},{"Tag":$atag}],"TagsToRemove":[]},"position":{"x":0,"y":-200}},
    {"id":$eid,"type":"End","data":{"Title":"End (aggression)"},"position":{"x":200,"y":-200}}
  ] | .edges += [
    {"id":("edge_"+$sid+"_"+$tid),"source":$sid,"target":$tid,"sourceHandle":"default"},
    {"id":("edge_"+$tid+"_"+$eid),"source":$tid,"target":$eid,"sourceHandle":"default"}
  ]' steps.json > tmp.json && mv tmp.json steps.json
```

## B. Bot Detection scenario

```bash
jq --arg sid "$SCENARIO_ID" --arg eid "$END_ID" '
  .nodes += [
    {"id":$sid,"type":"ScenarioBotDetection","data":{"Title":"Bot Detected"},"position":{"x":-200,"y":-100}},
    {"id":$eid,"type":"End","data":{"Title":"End (bot detected)"},"position":{"x":0,"y":-100}}
  ] | .edges += [{"id":("edge_"+$sid+"_"+$eid),"source":$sid,"target":$eid,"sourceHandle":"default"}]
' steps.json > tmp.json && mv tmp.json steps.json
```

## C. Goodbye scenario

```bash
STATEMENT_ID="node_$(uuidgen | tr -d '-' | cut -c1-16 | tr '[:upper:]' '[:lower:]')"
SIGNOFF="Thanks for reaching out! Have a great day."   # ask user for brand-appropriate text
jq --arg sid "$SCENARIO_ID" --arg stid "$STATEMENT_ID" --arg eid "$END_ID" --arg msg "$SIGNOFF" '
  .nodes += [
    {"id":$sid,"type":"ScenarioGoodbye","data":{"Title":"Goodbye Detected"},"position":{"x":-200,"y":0}},
    {"id":$stid,"type":"Statement","data":{"Title":"Signoff","Message":$msg},"position":{"x":0,"y":0}},
    {"id":$eid,"type":"End","data":{"Title":"End (goodbye)"},"position":{"x":200,"y":0}}
  ] | .edges += [
    {"id":("edge_"+$sid+"_"+$stid),"source":$sid,"target":$stid,"sourceHandle":"default"},
    {"id":("edge_"+$stid+"_"+$eid),"source":$stid,"target":$eid,"sourceHandle":"default"}
  ]' steps.json > tmp.json && mv tmp.json steps.json
```

## D. Custom scenario

Ask the user: (1) trigger condition in plain English, (2) title, (3) what
should happen when it fires.

```bash
TRIGGER="the lead mentions a competitor by name (Botify, ChatBuilder, etc.)"
TITLE="Competitor mention"
jq --arg sid "$SCENARIO_ID" --arg trigger "$TRIGGER" --arg title "$TITLE" '
  .nodes += [{"id":$sid,"type":"ScenarioCustom","data":{"Title":$title,"Condition":$trigger},"position":{"x":-200,"y":100}}]
' steps.json > tmp.json && mv tmp.json steps.json
```
Then build the response chain the user wants (Method, ModifyTags, Statement,
...) and wire `sid → ...` the same way as A–C.

## Sandbox test triggers (for `cb bot test`)

- Aggression: `"This is bullshit, your service is garbage"`
- Goodbye: `"Thanks, bye!"`
- Bot Detection: send overly structured/formal text
- Custom: send the literal trigger condition

## Common pitfalls

| Pitfall | Avoid |
|---|---|
| Scenario without a terminating `End` node | Every chain must terminate or the bot hangs |
| `ScenarioCustom` with a vague trigger | Be specific — "lead asks for a specific dollar amount", not "asks about pricing" |
| Multiple scenarios of the same type | CloseBot only honors one `Scenario*` of each type — check before adding |
| Too-broad `ScenarioGoodbye` detection | Every "thanks" could end the conversation prematurely — keep triggers strict |
| Aggression scenario without a handover tag | Defeats the purpose — always include `ModifyTags` |
