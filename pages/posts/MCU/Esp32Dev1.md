---
title: ESP32结合MicroPython在vs code下的开发环境搭建
date: 2025-12-24
updated:
categories: 开发笔记
tags:
  - 单片机
  - 开发环境搭建
  - ESP32
  - vs code
top:
---

#### 搭建 vs code 基本环境

> 使用 MicroPython 自然需要安装 Python，我使用的版本是 3.11.5，可以自行前往官网或者[阿里云镜像站](https://mirrors.aliyun.com/python-release/windows/?spm=a2c6h.25603864.0.0.9bbb2cfeNWPSr9)下载，此处不再赘述

&emsp;&emsp;打开 vs code，安装 Python、Pylance 和 RT-Thread MicroPython 插件，RT-Thread MicroPython 安装完后回到未打开文件夹的状态，左下角会出现一个加号，点击该加号，选择`创建新的MicroPython`工程 ➡️`创建一个空白的MicroPython工程`，此时就以工作区的形式打开了该工程。

::: warning
如果没有保存工作区配置文件，关闭 vs code 后左下角的功能菜单会“不翼而飞”。故退出时请一定保存工作区配置文件！（建议直接保存到工作目录方便下次打开）
::: details 工作区配置文件示例

```json [HelloWorld.code-workspace.json]
{
  "folders": [
    {
      "name": "RT-Thread MicroPython",
      "path": "."
    }
  ],
  "settings": {
    "MicroPython.executeButton": [
      {
        "text": "▶",
        "tooltip": "运行",
        "alignment": "left",
        "command": "extension.executeFile",
        "priority": 3.5
      }
    ],
    "MicroPython.syncButton": [
      {
        "text": "$(sync)",
        "tooltip": "同步",
        "alignment": "left",
        "command": "extension.execute",
        "priority": 4
      }
    ],
    "python.autoComplete.extraPaths": [
      "c:/Users/13783/.vscode/extensions/rt-thread.rt-thread-micropython-1.0.11/microExamples/code-completion"
    ],
    "files.associations": {
      ".mpyproject.json": "jsonc"
    }
  }
}
```
<!-- more -->
:::

#### 对接 MicroPython

&emsp;&emsp;前往 MicroPython 官网下载源代码包和对应的 ESP32 固件，再到[驱动网站](https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers?tab=downloads)下载 ESP32 驱动（以我使用的 ESP32-WROOM-32 为例），下载完成后双击安装。先运行`pip install esptool`，再分别执行`esptool --port COM3 erase_flash`和`esptool --chip esp32 --port COM3 --baud 460800 write_flash 0x1000 你的固件路径\esp32-20220618-v1.19.1.bin`。第一段指令清除 ESP32 原有的固件，第二段指令将我们刚刚下载的固件烧录到 ESP32 中以 0x1000 为首地址的存储单元（有标准，别乱改），两者均通过 COM3 串口进行。烧写完毕后在 vs code 扩展里打开 Python 设置的 Extra Paths，单击“在 setting.json 中编辑”写入以下内容，<mark>注意源码包需要事先解压好，并且如果是从Windows剪贴板复制进去的，盘符（C:、D:等）前面会有\\u202a导致路径识别错误，要手动删除再打空格。</mark>

```json [setting.json]
"python.autoComplete.extraPaths": [
 {
    "python.autoComplete.extraPaths": [
        "你的源码包路径/lib/micropython-lib/micropython",
        "c:/Users/你的用户名/.vscode/extensions/rt-thread.rt-thread-micropython-1.0.11/microExamples/code-completion"
    ],
    "python.linting.pylintArgs": [
        "--init-hook",
        "sys.path.append('你的源码包路径/lib/micropython-lib/micropython')",
        "import sys; sys.path.append('c:/Users/你的用户名/.vscode/extensions/rt-thread.rt-thread-micropython-1.0.11/microExamples/code-completion')"
    ],
    "python.analysis.extraPaths": [
        "你的源码包路径/lib/micropython-lib/micropython",
        "c:/Users/你的用户名/.vscode/extensions/rt-thread.rt-thread-micropython-1.0.11/microExamples/code-completion"
    ]
}]
```


接着执行 pip install micropython-esp32-stubs 安装 stubs（即 pyi 声明文件）即可正常使用代码补全。

::: details 为什么？
核心原因是平常的 CPython 和 MicroPython 是两套不同的系统，stubs 并非标准的 Python 类型声明文件，可以简单理解为它只提供了.pyi 而不提供.py，故只有 stubs 还是无法提供正确的代码提示，必须通过外部路径引用的方式将源码包提供给 Python 解释器才能和 pyi 有效整合，提供完整的代码补全服务！
:::

#### 连接 ESP32，点灯

&emsp;&emsp;经过以上步骤后基本就大功告成了，打开之前创建好的 RT-Thread MicroPython 工作区文件，单击左下角插头小图标，通过 COM3 串口连接到单片机，在.py 文件中写入以下代码，Ctrl+A 全选，Alt+X 烧录，成功点亮！

```python [点亮LED]
from machine import Pin # type:ignore
import time

led = Pin(2, Pin.OUT)
while True:
    led.value(1)
    time.sleep(1)
    led.value(0)
    time.sleep(1)
```
