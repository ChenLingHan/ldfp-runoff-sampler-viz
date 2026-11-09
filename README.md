# 清样田守 · 农田径流监测

田块出口降雨与出流曲线、8瓶留样、瓶内读数、配对化验、阀位流路和留样记录导出。桌面使用同屏工作台，较窄屏幕可纵向浏览。三维场景支持田块、主机剖视和阀组视角，样瓶和管路随页面状态更新。浏览器无法使用 WebGL 时显示布设预览图。

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

服务端应在采集环节按田块、事件和瓶号绑定记录。网页汇总总氮、总磷时只使用已审核且有代表水量的样瓶，单位换算为 g。水温、电导率不用于推算总氮或总磷。首次接入前先用同事件、同瓶号的回放记录核对时间与单位。
