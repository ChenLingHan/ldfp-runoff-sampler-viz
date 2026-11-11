# 清样田守 · 农田径流监测与净化

桌面工作台同屏呈现系统水路、在线水质、净化联锁和八瓶原水台账。可切换到雨量与出流图、三维采样视角，或打开净化模块工程剖视。较窄屏幕可纵向浏览。浏览器无法使用 WebGL 时仍可查看工程图和水质记录。

方案预览中，40 分钟双峰径流与在线水质按同一事件回放，净化模块展示首批 30 L 在第 6 至第 16 分钟的处理。雨后核验按钮演示后续批次待检、通过和未通过的分支，按钮只改变预览画面。处理记录、实际排放和调蓄余水分别统计。

方案预览按 60 L 触发组织两组悬沙、总氮、总磷联采，另外保留两个备用瓶。讲解模式缩短无动作时段，并在预冲、留样、隔离和清管切换时停留。快览模式用于快速检查整场过程。

本站无需构建或连接外部脚本服务。通过静态 HTTP 服务打开 `index.html`。项目包含 Three.js r160，许可证见 `THREE-LICENSE.txt`。

## GitHub Pages

仓库 **Settings → Pages → Deploy from a branch → main / (root)**。
访问 https://chenlinghan.github.io/ldfp-runoff-sampler-viz/ 。

## 设备接入

在 `dashboard.js` 设置 `CONFIG.endpoint` 为已启用 CORS 的 HTTPS JSON 接口。网关上传数据至独立服务，Pages 只读取。默认每 15 秒读取一次，超过 60 秒显示更新延迟。设备离线时由主控存储事件及留样记录。

接口返回同一田块同一场事件的完整快照，字段约定如下：

| 字段 | 说明 |
| --- | --- |
| `eventId` | 唯一事件号；建议由田块编号和事件日期组成 |
| `updatedAt` | UTC 或带时区的 ISO 8601 时间戳 |
| `points[]` | 事件时序，最多1440点；`minute` 从事件起点计时，严格递增；`flowLs` 为 L/s；`rainMm` 为本记录间隔雨量；`rainTotalMm` 与 `volumeL` 为非递减累计量；`stage` 取 0待机、1预冲、2留样、3隔离、4清管 |
| `bottles[]` | 依瓶号1–8依次返回；`id` 为整数；未留样瓶用 `slots: []` |
| `slots[]` | 每瓶最多3次有效增量样，记录 `minute` 到瓶时刻、`sourceStartMinute` 和 `sourceEndMinute` 的实际取水时段、`volumeMl` 样量、`representedVolumeL` 代表出流水量。未完成循环不写入有效样；源端保证各样本代表区间不重叠 |
| `probe` | 无读数时为 null；`quality: "valid"` 时提供 `temperatureC` 和 `conductivityUsCm`；异常为 `"invalid"` |
| `lab` | 无化验结果时为 null，或 `status: "pending"`；`status: "released"` 时提供审核后的 `tnMgL`、`tpMgL` |
| `treatment` | 可选水质与净化快照。含 `state`（`collect`、`treat`、`hold`、`release` 或 `fault`）、`valve`（`open`、`closed` 或 `unknown`）、`batchId`、`authorization`（`verified` 或 `pending`），以及非负 `storedL`、`processedL`、`dischargedL` |
| `treatment.inlet` / `treatment.batchInlet` / `treatment.outlet` | 分别为来水当前读数、所示批次的进水及出水读数。质控有效时给出 `ntu`（浊度）、`no3`（硝态氮，mg N/L）、`po4`（正磷酸盐磷，mg P/L）。缺测、失效或超时应传 null。 |

试制触发值为 80 NTU、3.0 mg N/L 和 0.25 mg P/L，属于来水筛查设置。接入时由本地控制器判定触发、控制泵阀并核验批次、化验、现场许可和阀位，再上传状态。网页没有下发指令的接口。数据过期时不继续显示已确认的阀位。

服务端应在采集环节按田块、事件和瓶号绑定记录。网页汇总总氮、总磷时只使用已审核且有代表水量的样瓶，单位换算为 g。水温、电导率不用于推算总氮或总磷。首次接入前先用同事件、同瓶号的回放记录核对时间与单位。
