# CloseBot Exits and Flow Connections

## The Three Parts of an Exit

A working exit requires **all three** pieces:

1. **ExitPaths** in the Method node data — defines available exits
2. **@@@ mentions** in instructions — tells the agent when to use the exit
3. **Edges** — connect the exit to the next node

Missing any piece = broken flow.

## ExitPaths Structure

```json
{
  "ExitPaths": [
    {
      "Title": "Exit 1",
      "Description": "When booking is complete or user declines",
      "MustHaveTags": [],
      "CantHaveTags": [],
      "UseTagRules": false,
      "FrontendExitId": "4460c366-a6db-48e5-bcc5-11988497ea46"
    }
  ]
}
```

## @@@ Mention Syntax

In Method node section Body:

```
After they book you can: @@@Exit 1

Once deposit is confirmed, proceed to booking via: @@@Exit 1

When finished, exit via: @@@Exit 1
```

The @@@ tells the agent "use this exit now". Without it, the agent doesn't know when to exit.

## Edge Structure

```json
{
  "source": "<source-node-id>",
  "sourceHandle": "Next",
  "target": "<target-node-id>",
  "targetHandle": null,
  "type": "default",
  "markerEnd": {"type": "arrowclosed"},
  "id": "reactflow__edge-<source-id>Next-<target-id>"
}
```

Note: `sourceHandle` is typically "Next" for the default flow, not "exit-1".

## Common Flow Pattern

```
Source → General Info Collection → Deposit Confirmation → Booking Agent → End
```

Each arrow = one edge. Each Method node needs ExitPaths + @@@ mention.

## Testing Exits

If a bot won't open in the UI or conversations hang:

1. Check for ExitPaths in Method nodes
2. Check for @@@ mentions in section Body
3. Check edges exist connecting nodes
4. Verify sourceHandle is "Next" not "exit-1"

## UI vs API Limitation

Exit configuration (ExitPaths, @@@ mentions, edge wiring) **must be done in the CloseBot UI**. The API `/save` endpoint accepts the JSON but doesn't properly wire the visual flow that the UI requires.

## Reference: Working Config Structure

From `GET /bot/{id}/steps?botVersion=X.Y.Z`:

```json
{
  "nodes": [
    {
      "id": "<uuid>",
      "type": "Method",
      "data": {
        "Title": "Booking Agent",
        "ExitPaths": [...],
        "Sections": [
          {
            "Title": "Booking Protocol",
            "Body": "Instructions here...\n\nAfter they book: @@@Exit 1"
          }
        ]
      }
    }
  ],
  "edges": [
    {
      "source": "<source-uuid>",
      "sourceHandle": "Next",
      "target": "<target-uuid>",
      "targetHandle": null,
      "type": "default"
    }
  ]
}
```

Note: NOT wrapped in `botSteps` — that's a different API shape.
