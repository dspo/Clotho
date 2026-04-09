## Default Permission

Default permissions for the reusable agent runtime plugin.

#### This default permission set includes the following:

- `allow-list-threads`
- `allow-get-thread-snapshot`
- `allow-create-thread`
- `allow-start-turn`
- `allow-resume-turn-stream`
- `allow-cancel-turn`
- `allow-submit-runtime-request`
- `allow-list-configs`
- `allow-resolve-config`
- `allow-get-runtime-catalog`

## Permission Table

<table>
<tr>
<th>Identifier</th>
<th>Description</th>
</tr>


<tr>
<td>

`agent-runtime:allow-cancel-turn`

</td>
<td>

Enables the cancel_turn command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-cancel-turn`

</td>
<td>

Denies the cancel_turn command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:allow-create-thread`

</td>
<td>

Enables the create_thread command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-create-thread`

</td>
<td>

Denies the create_thread command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:allow-get-runtime-catalog`

</td>
<td>

Enables the get_runtime_catalog command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-get-runtime-catalog`

</td>
<td>

Denies the get_runtime_catalog command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:allow-get-thread-snapshot`

</td>
<td>

Enables the get_thread_snapshot command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-get-thread-snapshot`

</td>
<td>

Denies the get_thread_snapshot command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:allow-list-configs`

</td>
<td>

Enables the list_configs command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-list-configs`

</td>
<td>

Denies the list_configs command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:allow-list-threads`

</td>
<td>

Enables the list_threads command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-list-threads`

</td>
<td>

Denies the list_threads command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:allow-resolve-config`

</td>
<td>

Enables the resolve_config command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-resolve-config`

</td>
<td>

Denies the resolve_config command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:allow-resume-turn-stream`

</td>
<td>

Enables the resume_turn_stream command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-resume-turn-stream`

</td>
<td>

Denies the resume_turn_stream command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:allow-start-turn`

</td>
<td>

Enables the start_turn command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-start-turn`

</td>
<td>

Denies the start_turn command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:allow-submit-runtime-request`

</td>
<td>

Enables the submit_runtime_request command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-submit-runtime-request`

</td>
<td>

Denies the submit_runtime_request command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`agent-runtime:automation`

</td>
<td>

Automation agent runtime permissions: create and continue turns with request submission for unattended automation flows.


</td>
</tr>

<tr>
<td>

`agent-runtime:debug`

</td>
<td>

Debug agent runtime permissions: operator access plus interruption for local debugging and recovery.


</td>
</tr>

<tr>
<td>

`agent-runtime:operator`

</td>
<td>

Operator agent runtime permissions: interactive turn lifecycle plus read-only inspection.


</td>
</tr>

<tr>
<td>

`agent-runtime:read-only`

</td>
<td>

Read-only agent runtime permissions: list threads, inspect snapshots, list configs, and inspect catalog.


</td>
</tr>
</table>
