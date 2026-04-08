## 默认权限

可复用 agent runtime plugin 的默认权限。

#### 默认权限集包含：

- `allow-list-threads`
- `allow-get-thread-snapshot`
- `allow-create-thread`
- `allow-start-turn`
- `allow-resume-turn-stream`
- `allow-cancel-turn`
- `allow-submit-runtime-request`
- `allow-list-config-files`
- `allow-resolve-config-profile`
- `allow-get-runtime-catalog`

## 权限表

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

允许在无预设作用域的情况下调用 cancel_turn 命令。

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-cancel-turn`

</td>
<td>

禁止在无预设作用域的情况下调用 cancel_turn 命令。

</td>
</tr>

<tr>
<td>

`agent-runtime:allow-create-thread`

</td>
<td>

允许在无预设作用域的情况下调用 create_thread 命令。

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-create-thread`

</td>
<td>

禁止在无预设作用域的情况下调用 create_thread 命令。

</td>
</tr>

<tr>
<td>

`agent-runtime:allow-get-runtime-catalog`

</td>
<td>

允许在无预设作用域的情况下调用 get_runtime_catalog 命令。

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-get-runtime-catalog`

</td>
<td>

禁止在无预设作用域的情况下调用 get_runtime_catalog 命令。

</td>
</tr>

<tr>
<td>

`agent-runtime:allow-get-thread-snapshot`

</td>
<td>

允许在无预设作用域的情况下调用 get_thread_snapshot 命令。

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-get-thread-snapshot`

</td>
<td>

禁止在无预设作用域的情况下调用 get_thread_snapshot 命令。

</td>
</tr>

<tr>
<td>

`agent-runtime:allow-list-config-files`

</td>
<td>

允许在无预设作用域的情况下调用 list_config_files 命令。

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-list-config-files`

</td>
<td>

禁止在无预设作用域的情况下调用 list_config_files 命令。

</td>
</tr>

<tr>
<td>

`agent-runtime:allow-list-threads`

</td>
<td>

允许在无预设作用域的情况下调用 list_threads 命令。

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-list-threads`

</td>
<td>

禁止在无预设作用域的情况下调用 list_threads 命令。

</td>
</tr>

<tr>
<td>

`agent-runtime:allow-resolve-config-profile`

</td>
<td>

允许在无预设作用域的情况下调用 resolve_config_profile 命令。

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-resolve-config-profile`

</td>
<td>

禁止在无预设作用域的情况下调用 resolve_config_profile 命令。

</td>
</tr>

<tr>
<td>

`agent-runtime:allow-resume-turn-stream`

</td>
<td>

允许在无预设作用域的情况下调用 resume_turn_stream 命令。

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-resume-turn-stream`

</td>
<td>

禁止在无预设作用域的情况下调用 resume_turn_stream 命令。

</td>
</tr>

<tr>
<td>

`agent-runtime:allow-start-turn`

</td>
<td>

允许在无预设作用域的情况下调用 start_turn 命令。

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-start-turn`

</td>
<td>

禁止在无预设作用域的情况下调用 start_turn 命令。

</td>
</tr>

<tr>
<td>

`agent-runtime:allow-submit-runtime-request`

</td>
<td>

允许在无预设作用域的情况下调用 submit_runtime_request 命令。

</td>
</tr>

<tr>
<td>

`agent-runtime:deny-submit-runtime-request`

</td>
<td>

禁止在无预设作用域的情况下调用 submit_runtime_request 命令。

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
