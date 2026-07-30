---
title: 疑难杂症FAQ
date: 2025-12-24
draft: true
categories: 元操作
---

- vs code Markdown 文件快速开关“自动换行”快捷键：Alt+Z
- vs code 在新标签页中打开窗口快捷键 Ctrl+Shift+N,或者在“打开最近文件”时按住 Ctrl 不放

### “此模块被阻止加载到安全机构”的解决方法
前言
部分国外开发的软件、程序等使用了一些第三方安全模块，但 Windows 11 自 22H2 起默认情况下开启了更高级别的安全防护，阻止将这些模块（如mdnsnsp.dll、prxernsp.dll）加载到本地安全机构（LSA）。

对于新安装（例如重装系统等）的 Windows 11 22H2 及以上，Windows 会自动通过注册表启用 LSA 保护。对于从旧版本系统升级到 Windows 11 22H2 及以上的系统，一般情况下不会开启。

解决方案
方法一 使用注册表关闭（设备未使用 UEFI 变量来控制 LSA 保护）
打开项：

HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Lsa
找到 DWORD 值：RunAsPPL 和 RunAsPPLBoot。将其值全部修改为 0 即可。

<!-- more -->

### platformio.ini配置STM32开发环境中的坑
**<font color="red">注意！在build_type = release的情况下，所有在中断里修改的变量都要使用volatile关键字进行修饰，否则该变量将被视为常量，无法正常执行修改逻辑！</font>**
::: details 如果不使用volatile修饰
::: danger 可能无法正常执行！
```c 样板代码.c
#include "Delay.h"
#include "LED.h"
#include "stm32f10x.h"

/* 有问题的声明部分！！！如果此处不使用volatile，
在build_type=release模式下将保持常量状态，无法正确修改！ */
uint8_t aaa = 0;
uint8_t bbb = 0;

// 以下为正确的声明方式
volatile uint8_t aaa = 0;
volatile uint8_t bbb = 0;

void EXTI15_10_IRQHandler() {
    if (EXTI_GetITStatus(EXTI_Line10)) {
        aaa = 1;
    }
    EXTI_ClearITPendingBit(EXTI_Line10);
}

int main() {
    ......

    while (1) {
      // 此处将无法正常执行判断逻辑
        if (aaa) {
            GPIO_ResetBits(GPIOA, GPIO_Pin_0);
        }
    }
    ......
}
```
:::

##### 总结
为什么不用volatile不行？ 因为编译器默认程序是单线程、顺序执行的，它不知道中断这种异步事件的存在。为了效率，它会进行激进的优化，导致main函数“看不到”中断对变量的修改。

为什么用了volatile就行了？ 因为volatile表示该变量随时可能发生变化，不允许用缓存机制（寄存器等），而是强制编译器放弃对这个变量的所有优化假设，要求它每次访问都必须是真实的内存读写，从而保证了main函数能实时看到中断服务函数所做的修改。

有一个重要的原因，不加volatile修饰的变量，编译器可能出于优化目的缓存到寄存器，即使在main函数里修改了也是修改寄存器里的变量，而中断修改的是内存里的变量从而导致main函数“看不见”该变量。而volatile会强制要求编译器每次读写都使用内存里的变量，不许存到寄存器，因此中断修改后main就能看见了。然而debug模式下没有这样的深度优化，因此不受影响。

所以，请记住这条嵌入式开发的铁律：
凡是既在中断服务函数中修改，又在主循环或其他普通函数中读取的全局变量，都必须用volatile修饰。

这是无数工程师踩过的坑凝结出的经验。你现在理解了它，就足以避免一个非常隐蔽且棘手的bug。
