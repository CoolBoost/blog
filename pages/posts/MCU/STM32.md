---
title: STM32基础
date: 2026-4-14
updated:
categories: 开发笔记
draft: false
tags:
  - 单片机
  - STM32
  - vs code
top:
---

## 写在前面
> * 本文大部分知识来自<a href="https://jiangxiekeji.com/index.html" target="block">江协科技</a>发布在B站的<a href="https://www.bilibili.com/video/BV1th411z7sn?spm_id_from=333.788.videopod.episodes&vd_source=f0f9f2df6f5c66192f95d51f38e382f1" target="block">STM32入门教程-2023版 细致讲解 中文字幕</a>视频，BV号为<a href="https://www.bilibili.com/video/BV1th411z7sn?spm_id_from=333.788.videopod.episodes&vd_source=f0f9f2df6f5c66192f95d51f38e382f1" target="block">BV1th411z7sn</a>
> * 本文主要内容为STM32中各种功能的底层原理，并不涉及太过具体的代码实现，主要起帮助理解和防止遗忘的作用。

## 何为驱动能力？
驱动能力通常指驱动外设的能力，以STM32中常见的推挽（PP）和开漏（OD）两种输出方式为例。

在PP模式下：输出寄存器为1对应p-MOS管导通，n-MOS管阻断状态，引脚直接连接到VDD，输出高电平；输出寄存器置0对应p-MOS管截止，n-MOS管导通状态，引脚连接到VSS，输出低电平。

在OD模式下：此时p-MOS管被禁用，输出寄存器1对应n-MOS截止状态，此时引脚为不具备任何驱动能力的开路状态，但可以通过外接自带GND的5V电源的方式实现5V供电。若输出寄存器置0则引脚直接连接VSS，在有外部电源供电的情况下是具备驱动能力的。

<img src="/MCU/gpio.png" alt="图片加载失败" width="500">
<div><center>GPIO引脚电路原理图</center></div>
<div><center>图片来自<a href="https://jiangxiekeji.com/index.html" target="block">江协科技</a>B站视频stm32入门教程，<a href="https://www.bilibili.com/video/BV1th411z7sn?spm_id_from=333.788.videopod.episodes&vd_source=f0f9f2df6f5c66192f95d51f38e382f1" target="block">跳转链接</a></center></div>
<!-- more -->

## EXTI_INTR外部中断
先来回顾下中断执行的过程：关中断->保存断点->引出中断服务程序地址->保护现场和屏蔽字->开中断->执行中断服务程序->关中断->恢复现场和屏蔽字->开中断->中断返回

在stm32中，中断的执行顺序由NVIC决定。在此之前，AFIO会进行中断引脚的选择，大概像下面这样：

<img src="/MCU/intr.png" alt="图片加载失败" width="500">
<div><center>中断执行过程</center></div>
<div><center>图片来自<a href="https://jiangxiekeji.com/index.html" target="block">江协科技</a>B站视频stm32入门教程，<a href="https://www.bilibili.com/video/BV1th411z7sn?spm_id_from=333.788.videopod.episodes&vd_source=f0f9f2df6f5c66192f95d51f38e382f1" target="block">跳转链接</a></center></div>

可以看到，GPIOA、GPIOB和GPIOC各有16个引脚连接到AFIO，但AFIO和EXTI间总共只有16个引脚，故虽然所有的GPIO口都能触发中断，但相同的Pin是不能同时触发中断的（如GPIOA_Pin_0、GPIOB_Pin_0、GPIOC_Pin_0不能一起进来）。在同一时刻，AFIO只会选择其中一组引脚传给EXTI，而EXTI可以监测GPIO口的电平信号，当指定的GPIO口产生电平变化时就立即向NVIC发出中断申请，经NVIC裁决后即可中断CPU主程序，执行中断服务程序。AFIO的主要作用是中断引脚选择和复用功能引脚重映射。

EXTI支持的触发方式有：上升沿、下降沿、双边沿和软件触发（Trap指令？），触发响应方式分为中断响应（CPU处理）和事件响应（其他外设处理）。

不过，EXTI和NVIC之间的专用线路并没有16条，而是把5~9、10~15分别复用成了两条线，需要通过标志位进一步区分是哪个引脚触发了中断。

⚠️Delay、更新OLED等操作不应写在中断里，由于按键抖动问题，中断可能被触发两次。正确做法是在中断中仅设置标志位，其他操作全部写在主线程或定时器中断里且<font color="red">**一定要记得清除中断标志防止退不出中断。**</font>

::: details 外部中断实现代码
::: warning
由于机械按键抖动问题中断有时会触发两次，因此要在主线程里做好消抖，即确保中断重复触发时主线程处于休眠或忙等状态，同步信号量保持为1，不予响应。
```c main.c
#include "Delay.h"
#include "Key.h"
#include "LED.h"
#include "OLED.h"
#include "stm32f10x.h"

int Sync = 0;
int count = 0;

// 设置中断执行函数
void EXTI15_10_IRQHandler() {
    // 保证中断是由Pin_14引脚触发的
    if (EXTI_GetITStatus(EXTI_Line14) == SET) {
        Sync = 1;
        // 一定要清除中断标志，否则会卡死在中断里
        EXTI_ClearITPendingBit(EXTI_Line14);
    }
}

int main() {
    OLED_Init();
    OLED_ShowNum(1, 1, 0, 5);
    // 开启GPIOB和AFIO的时钟
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_AFIO, ENABLE);

    GPIO_InitTypeDef GPIO_Structure = {
        .GPIO_Mode = GPIO_Mode_IPU,
        .GPIO_Pin = GPIO_Pin_14,
        .GPIO_Speed = GPIO_Speed_50MHz,
    };
    GPIO_Init(GPIOB, &GPIO_Structure);

    // 实际操作的是AFIO，选择GPIOB_Pin_14作为外部中断线
    GPIO_EXTILineConfig(GPIO_PortSourceGPIOB, GPIO_PinSource14);

    // 配置EXTI的相关信息，包括中断模式、触发方式等
    EXTI_InitTypeDef EXTI_Structure = {
        .EXTI_Line = EXTI_Line14,
        .EXTI_LineCmd = ENABLE,
        .EXTI_Mode = EXTI_Mode_Interrupt,
        .EXTI_Trigger = EXTI_Trigger_Falling,
    };
    EXTI_Init(&EXTI_Structure);

    // 2位抢占优先级，2位响应优先级
    NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);

    // 使能NVIC中断总线，配置中断优先级
    NVIC_InitTypeDef NVIC_Structure = {
        .NVIC_IRQChannel = EXTI15_10_IRQn,
        .NVIC_IRQChannelCmd = ENABLE,
        .NVIC_IRQChannelPreemptionPriority = 1,
        .NVIC_IRQChannelSubPriority = 1,
    };
    NVIC_Init(&NVIC_Structure);
    while (1) {
        if (Sync) {
            Delay_ms(20);
            // 如果一直按着就忙等
            while (!GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_14));
            count += 1;
            OLED_ShowNum(1, 1, count, 5);
            // 恢复同步信号量
            Sync = 0;
        }
    }
}

// 如果希望按下时触发而不是抬起才触发，就把while(1)代码块改成
// while (1) {
//         if (Sync) {
//             Delay_ms(20);
//             count += 1;
//             OLED_ShowNum(1, 1, count, 5);
//             // 如果一直按着就忙等
//             while (!GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_14));
//             Delay_ms(20);
//             // 恢复同步信号量
//             Sync = 0;
//         }
//     }
```
:::

## 定时器
* 定时器可以对输入的时钟进行计数,并在计数值达到设定时触发中断
* 72MHz / 65536 / 65536 取倒数后得到59.65s，在非级联状态下可以实现最大59.65s的定时
* 定时器不仅能定时，还包含内外时钟源选择、输入捕获、输出比较、编码器接口、主从触发模式等功能
::: details 定时器中断实现代码
```c Timer.c
/** Timer.c */
#include "stm32f10x.h"

void Timer_Init() {
    // 使能APB1总线
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_TIM2, ENABLE);
    // 选择内部定时器（TIM2）
    TIM_InternalClockConfig(TIM2);

    // 初始化定时器
    TIM_TimeBaseInitTypeDef TIM_TimeBaseInitStructure = {
        .TIM_ClockDivision = TIM_CKD_DIV1,
        .TIM_CounterMode = TIM_CounterMode_Up,
        /* 注意！Period和Prescaler寄存器都是16位，最大仅能表示65535，故不能写成重装1000，分频72000的形式！*/
        .TIM_Period = 10000 - 1,
        .TIM_Prescaler = 7200 - 1,
        .TIM_RepetitionCounter = 0,
    };
    // 由于缓冲寄存器的存在，为了使值立刻生效，调用该函数时会即刻产生一次更新中断
    TIM_TimeBaseInit(TIM2, &TIM_TimeBaseInitStructure);
    // 故调用ClearFlag清除该中断，使计数器从0开始
    TIM_ClearFlag(TIM2, TIM_FLAG_Update);

    // 使能定时器中断
    TIM_ITConfig(TIM2, TIM_IT_Update, ENABLE);

    // 配置NVIC
    NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);

    NVIC_InitTypeDef NVIC_InitStructure = {
        .NVIC_IRQChannel = TIM2_IRQn,
        .NVIC_IRQChannelCmd = ENABLE,
        .NVIC_IRQChannelPreemptionPriority = 1,
        .NVIC_IRQChannelSubPriority = 1,
    };
    NVIC_Init(&NVIC_InitStructure);

    // 最后别忘了启动定时器
    TIM_Cmd(TIM2, ENABLE);
}
```
```c main.c
/** main.c */
#include "OLED.h"
#include "Timer.h"
#include "stm32f10x.h"

int count = 0;

void main() {
    OLED_Init();
    Timer_Init();
    while (1) {
        OLED_ShowNum(1, 1, count, 10);
        OLED_ShowNum(2, 1, TIM_GetCounter(TIM2), 5);
    }
}

void TIM2_IRQHandler() {
    if (TIM_GetITStatus(TIM2, TIM_IT_Update) == SET) {
        count++;
        TIM_ClearITPendingBit(TIM2, TIM_IT_Update);
    }
}
```
:::

## PWM
> 前排提醒：PWM和ADC并不是想要哪个引脚就用哪个引脚，对STM32而言有严格的引脚定义，具体可以参考引脚定义图
* PWM频率：Freq = CK_PSC / (PSC + 1) / (ARR + 1)
* PWM占空比：Duty = CCR / (ARR + 1)
* PWM分辨率：Reso = 1 / (ARR + 1)

:::details PWM实现代码
该程序在PA0引脚上输出频率为1MHz，占空比为50%的PWM方波
```c PWM.c
#include "stm32f10x.h"

void PWM_Init() {
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_TIM2, ENABLE);
    TIM_InternalClockConfig(TIM2);
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE);

    GPIO_InitTypeDef GPIO_InitStructure = {
        .GPIO_Pin = GPIO_Pin_0,
        .GPIO_Mode = GPIO_Mode_AF_PP,
        .GPIO_Speed = GPIO_Speed_50MHz,
    };
    GPIO_Init(GPIOA, &GPIO_InitStructure);

    TIM_TimeBaseInitTypeDef TIM_TimeBaseInitStructure = {
        .TIM_ClockDivision = TIM_CKD_DIV1,
        .TIM_CounterMode = TIM_CounterMode_Up,
        .TIM_Period = 2 - 1,     // ARR
        .TIM_Prescaler = 36 - 1,  // PSC
        .TIM_RepetitionCounter = 0,
    };

    TIM_TimeBaseInit(TIM2, &TIM_TimeBaseInitStructure);

    TIM_OCInitTypeDef TIM_OCInitStructure;
    TIM_OCStructInit(&TIM_OCInitStructure);

    TIM_OCInitStructure.TIM_OCMode = TIM_OCMode_PWM1;
    TIM_OCInitStructure.TIM_OCPolarity = TIM_OCPolarity_High;
    TIM_OCInitStructure.TIM_OutputState = TIM_OutputState_Enable;
    TIM_OCInitStructure.TIM_Pulse = 1; // CCR

    TIM_OC1Init(TIM2, &TIM_OCInitStructure);

    TIM_Cmd(TIM2, ENABLE);
}
```
:::
实际上可以很明显看出定时器中断和PWM都调用了TIM_TimeBaseInit()这个函数，区别是在这之后是使能中断并配置NVIC和中断执行函数还是配置OCInit，不过无论哪种配置方式最后都要使用TIM_Cmd()开启定时器。

## TIM输入捕获
输入捕获有三种方式，如下图所示：

<img src="/MCU/pl_test.png" alt="图片加载失败" width="500">
<center>图片来自<a href="https://jiangxiekeji.com/index.html" target="block">江协科技</a>B站视频stm32入门教程，<a href="https://www.bilibili.com/video/BV1th411z7sn?spm_id_from=333.788.videopod.episodes&vd_source=f0f9f2df6f5c66192f95d51f38e382f1" target="block">跳转链接</a></center>

测频法适合高频场景，测周法适合低频。实际上频率测试也是通过TIM定时器实现的，把原本的TIM_OC1Init改成了TIM_ICInit，其原理如下图所示：

<img src="/MCU/PWMI.png" alt="图片加载失败" width="500">
<div><center>图片来自<a href="https://jiangxiekeji.com/index.html" target="block">江协科技</a>B站视频stm32入门教程，<a href="https://www.bilibili.com/video/BV1th411z7sn?spm_id_from=333.788.videopod.episodes&vd_source=f0f9f2df6f5c66192f95d51f38e382f1" target="block">跳转链接</a></center></div>

当GPIO引脚的PWM输入产生变化时，TIM_ICInit会检测到该变化。如果是直通、上升沿触发则会在上升沿时把CNT的值搬到CCR1内并清空CNT（具体情况要根据TIM_ICInitStructure里的配置确定），如果是交叉、下降沿触发则在一个周期内的下降沿出现时能捕捉到并把CNT的值搬到CCR2中再清空CNT。所以我们实际上是在以一定的频率进行统计，该频率由TimeBaseInitStructure中的TIM_Prescaler参数确定，而统计次数则存储在CCR中。因此，输入的频率就是F<sub>c</sub> / CCR，而占空比则为CCR2 / CCR1，又因为直接相除在u_int状态下会被记录成0，所以使用CCR2 * 100 / CCR1即可完整测得实际占空比。

值得注意的是，CNT的最大值取决于TimeBaseInitStructure中的属性TIM_Period的值，故在频率较低的情况下为了避免溢出，可以将TIM_Period设为最大值65535或把分频器TIM_Prescaler的值设置的大一些以获得更低的频率。

## ADC（analog to digital converter）转换器
> 从本节开始就比较重要了 能整的花活也比较多，未来在项目中可能用的多，建议认真学习。

ADC，即把模拟信号转换成数字信号，常见于电位器、光敏模块、温湿度传感器等部件的应用中，还有一种DAC，目前主要用在波形生成领域和音频解码领域等，部分场景已经被PWM代替。在STM32F103C8T6中使用的是12位逐次逼近型ADC，1us转换时间（即支持的最大转换频率为1MHz），可以承受0~3.3V的电压，数值为0~4095，拥有2个ADC资源和10个外部输入通道。ADC分成规则组（常用）和注入组（突发）两个转换单元，支持模拟看门狗自动监测输入电压范围。

ADC的原理是通过一个DAC转换器和一个比较器，采用加权电阻网络（？？？）的方式来匹配的。DAC的范围为0~255，首先会输入255的一半，差不多128，如果大了就再缩小一半，给64，还大就再缩小到32，小了就扩大到32和64的中间值，以此类推就可以以O(log<sub>2</sub>(x))的复杂度得到匹配的值。而驱动该比较的时钟就是ADCCLK，其时钟来源为RCC，但RCC（APB2）最高支持到72MHz而ADC14MHz就已经是极限，所以预分频器必须配置为6分频（对应12MHz）或8分频（对应9MHz）。ADC的模拟看门狗电路中可以设置一个阈值高限和阈值底限，配置看门狗并选定了通道后一旦检测到超出阈值，看门狗就会向NVIC申请中断，同时上限阈值和下限阈值也能进入中断处理函数。

<img src="/MCU/adc.png" alt="图片加载失败" width="500">
<div><center>ADC执行过程</center></div>
<div><center>图片来自<a href="https://jiangxiekeji.com/index.html" target="block">江协科技</a>B站视频stm32入门教程，<a href="https://www.bilibili.com/video/BV1th411z7sn?spm_id_from=333.788.videopod.episodes&vd_source=f0f9f2df6f5c66192f95d51f38e382f1" target="block">跳转链接</a></center></div>

ADC也能像PWM_IC那样配置交叉模式，这样识别精度能比单个ADC来得高。同时需要注意规则组的四种转换模式：
> 横向为连续/非连续模式，纵向为扫描/非扫描模式
* 单次转换，非扫描模式：需要手动调用函数触发（通常写在while(1)里），一次只扫描一个通道，如需扫多个通道要修改通道号并重新调用函数扫描，每次扫描完触发EOC信号，停止。
* 单次转换，扫描模式：只需要触发一次就能连续扫描一个通道，不需要在while循环里一直触发，扫描完一个通道后触发EOC信号但会继续扫描，不会停下。
* 连续转换，非扫描模式：同样只触发一次但用到了“菜单”的功能，可对多个通道依次进行扫描，为节省开销在结构体里会有一个通道数目的属性，可准确指定使用通道的数目。由于单片机寄存器没有那么大，故需用DMA将数据及时移走防止被覆盖。指定的通道数目全部扫描完成后触发EOC信号。
* 连续转换，扫描模式：一旦触发就不停地对“菜单”进行扫描。
* 间断模式：可配置扫描过程中每隔几个转换就暂停一次，需要再次触发方能继续扫描。

stm32ADC的总转换时间为：采样时间 + 12.5个ADC周期。采样时间可在程序里手动进行配置，越短越灵敏，越长越稳定。ADC周期由ADCCLK确定，如果ADCCLK为14MHz，采样时间为1.5个ADC周期则总时间等于1.5+12.5=14个ADC周期，即1us。另外，建议每次上电时对ADC进行一次校准。
:::details ADC实现代码
```c ADC.c
#include "stm32f10x.h"

void ADC1_Init() {
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_ADC1, ENABLE);
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE);

    // 把ADC频率限制到12MHz
    RCC_ADCCLKConfig(RCC_PCLK2_Div6);

    GPIO_InitTypeDef GPIO_InitStructure = {
        .GPIO_Mode = GPIO_Mode_AIN,
        .GPIO_Pin = GPIO_Pin_0 | GPIO_Pin_1,
        .GPIO_Speed = GPIO_Speed_50MHz,
    };
    GPIO_Init(GPIOA, &GPIO_InitStructure);

    ADC_InitTypeDef ADC_InitStructure = {
        .ADC_Mode = ADC_Mode_Independent,
        //^ AD多通道状态下禁止使用连续扫描!!!
        .ADC_ContinuousConvMode = DISABLE,
        .ADC_ScanConvMode = DISABLE,
        .ADC_DataAlign = ADC_DataAlign_Right,
        // 配置使用内部软件触发
        .ADC_ExternalTrigConv = ADC_ExternalTrigConv_None,
        // 采集规则组的一个通道
        .ADC_NbrOfChannel = 1,
    };
    ADC_Init(ADC1, &ADC_InitStructure);

    // 打开ADC开关（上电）
    ADC_Cmd(ADC1, ENABLE);

    // 初始化ADC
    ADC_ResetCalibration(ADC1);
    while (ADC_GetResetCalibrationStatus(ADC1));
    ADC_StartCalibration(ADC1);
    while (ADC_GetCalibrationStatus(ADC1));
}

uint16_t Get_ADC_Value(uint8_t ADC_Channel) {
    //// 通道ADC_Channel_0排在第一位
    // 用户自定义通道
    ADC_RegularChannelConfig(ADC1, ADC_Channel, 1, ADC_SampleTime_55Cycles5);
    // 软件触发采样
    ADC_SoftwareStartConvCmd(ADC1, ENABLE);
    while (ADC_GetFlagStatus(ADC1, ADC_FLAG_EOC) == RESET);
    return ADC_GetConversionValue(ADC1);
}
```
```c main.c
#include "ADC.h"
#include "Delay.h"
#include "OLED.h"
#include "stm32f10x.h"

int main() {
    OLED_Init();
    ADC1_Init();

    OLED_ShowString(1, 1, "PA0ADValue:");
    OLED_ShowString(2, 1, "PA1ADValue:");
    // OLED_ShowString(2, 1, "Volatge:0.00V");

    while (1) {
        uint16_t PA0_Value = Get_ADC_Value(ADC_Channel_0);
        //* 如果不小心设置了连续模式，所有通道都会被PA1_Value覆盖，如果电位器接PA0值会变成PA1
        uint16_t PA1_Value = Get_ADC_Value(ADC_Channel_1);
        OLED_ShowNum(1, 12, PA0_Value, 4);
        OLED_ShowNum(2, 12, PA1_Value, 4);
    }
}

```
:::

## USART串口通讯协议
:::details 异步通信
异步通信的典型特征是没有时钟线，设备之间各自跑各自的时钟，通过约定好的波特率、电平等方式加以固定的帧边界来标识数据帧，适用于对实时性和速率要求不高的场景。
:::
USART是通过两根线实现的点对点异步全双工通信协议，TX发送，RX接收。需要注意的是两边设备的电平标准必须相同，即要么共VCC和GND，要么不共VCC但电压必须一致，共GND。严禁两边设备电压不同，可能会烧IO口。常见的电平标准如下：
* TTL电平：+3.3V或+5V表示1，0V表示0，普通单片机常用
* RS232电平：-3~-15V表示1，+3~+15V表示0，一般在大型机器上使用，抗静电干扰能力强
* RS485电平：两线压差+2~+6V表示1，-2~-6V表示0（差分信号，只有两根线）

USART的串口参数和时序非常重要，包括以下几个部分：
* 波特率：串口通信速率，由于USART是一个比特一个比特传输的，所以波特率实际上就是比特率
* 起始位：标识数据帧的开始部分，固定为低电平
* 数据位：有效载荷，1为高电平，0为低电平，从低位开始发送（即00001111B先发1111再发0000）
* 校验位：采用奇/偶校验方式，具体值根据数据位来
* 停止位：固定为高电平

不难发现，如果是1（起始位）+8（数据位）+1（停止位）的编码方式，一次能传输1B。若是1+8+1+1的形式也是传1B，不过多了一位校验而已。UART默认只能发送一个字节的数据，如果要发送多个需要一些方法来进行处理。

## I2C协议
**注意：<font color="red">开漏输出</font>模式下<font color="red">引脚写1对应MOS管截止（高阻态），引脚写0对应MOS管导通（低电平）</font>**

I2C是一种同步半双工协议，它的基本时序单元如下：
* 起始标志：SCL高电平期间，SDA从高电平切换到低电平
* 终止标志：SCL高电平期间，SDA从低电平切换到高电平
* 发送一个字节：SCL低电平期间，主机将数据位放到SDA线上（高位先行），然后释放SCL。从机只在SCL从0跳变到1后的某个“窗口期”进行采样，在SCL高电平期间SDA是不允许数据变化的。依照上述过程重复8次即可发送一个字节。如果发送过程中主机进中断了，SCL和SDA就会保持不变，这样从机也会暂时停止工作进行等待，保证了数据同步
* 接收一个字节：SCL低电平期间，从机将数据位放到SDA线上（高位先行），然后释放SCL。主机只在SCL从0跳变到1后的某个“窗口期”进行采样，在SCL高电平期间SDA是不允许数据变化的。依照上述过程重复8次即可发送一个字节（主机在接收之前需要释放SDA）
* 发送应答：主机在接收完一个字节后，在下一个时钟发送一位数据，告知从机已经接收到该字节并指示下一步操作，数据0表示应答（从机可以继续发送），数据1表示非应答（从机应停止发送）
* 接收应答：主机在发送完一个字节后，在下一个时钟接收一位数据，判断从机是否应答，数据0表示应答，数据1表示非应答（主机在接收之前要释放SDA）

I2C时序：
* 指定地址写：对于指定设备，在指定地址下写入指定数据。该方式的特点是主机产生起始标志后发送的第一个字节的最后一位为0，在收到从机RA=0的应答后再次发送一个字节指定要写入的地址，当再次收到RA=0应答后就可以开始写入了。
* 当前地址读：对于指定设备，在当前地址指针指示的地址下读取从机数据。该方式特点为收到的第一段数据来自地址指针对应的寄存器，而地址指针如果没有提前确定是不知道会读到哪个寄存器的数据的，所以一般都要先用指定地址写来修改地址指针的值。
* 指定地址读：对于指定设备，在指定地址下读取从机数据。该方式结合了指定地址写和当前地址读，执行流程如下：
  * 首先产生起始标志，后跟从机地址，指定模式为写（末尾0）
  * 收到从机RA=0后发送一个字节指定地址，即修改地址指针的内容
  * 再次收到从机RA=0后再产生一个起始标志（在这之前加不加停止都可以），后跟从机地址，指定模式为读（末尾1）
  * 收到从机RA=0后就可以从当前地址指针的位置开始读了（注意从RA=0开始到读结束都是从机在控制），读完后发送一个SA信号，如果SA=1就代表不用读了，产生停止标志，结束

<img src="/MCU/I2C/I2C_指定位置读.png" alt="图片加载失败" width="800">
<div><center>I2C协议指定位置读的部分时序</center></div>
<div><center>图片来自<a href="https://jiangxiekeji.com/index.html" target="block">江协科技</a>B站视频stm32入门教程，<a href="https://www.bilibili.com/video/BV1th411z7sn?spm_id_from=333.788.videopod.episodes&vd_source=f0f9f2df6f5c66192f95d51f38e382f1" target="block">跳转链接</a></center></div>

* **<font color="red">需注意：指定读写标志位只能跟着起始条件的第一个字节（最后一位，0表示写，1表示读），所以要切换读写方向就必须另起时序，这就是指定地址读最核心的部分。同时，由于地址只能指定一次，故想要随机读写就要起多个起始标志</font>**
* 由于地址指针在一次读/写操作后会自动+“1”，故在指定地址后只要通过连续发送就可对一整片连续的寄存器进行读写

硬件I2C（简单了解即可）：
硬件I2C可直接由片上I2C硬件外设发起，减轻CPU负担，支持多主机模型、7位/10位地址模式、标准（100KHz）和快速（400KHz）通讯速度以及DMA和SMBus协议。STM32F103C8T6拥有I2C1和I2C2两个硬件资源。

主机发送和接收流程如下图所示：

<img src="/MCU/I2C/I2C_HD_Send.png" alt="图片加载失败" width="600">
<div><center>I2C硬件发送数据</center></div>
<div><center>图片来自<a href="https://jiangxiekeji.com/index.html" target="block">江协科技</a>B站视频stm32入门教程，<a href="https://www.bilibili.com/video/BV1th411z7sn?spm_id_from=333.788.videopod.episodes&vd_source=f0f9f2df6f5c66192f95d51f38e382f1" target="block">跳转链接</a></center></div>

<img src="/MCU/I2C/I2C_HD_Rec.png" alt="图片加载失败" width="600">
<div><center>I2C硬件接收数据</center></div>
<div><center>图片来自<a href="https://jiangxiekeji.com/index.html" target="block">江协科技</a>B站视频stm32入门教程，<a href="https://www.bilibili.com/video/BV1th411z7sn?spm_id_from=333.788.videopod.episodes&vd_source=f0f9f2df6f5c66192f95d51f38e382f1" target="block">跳转链接</a></center></div>

其中EV表示事件，事件的本质是若干标志位的集合，通过检测对应事件的产生和消灭就能判断当前I2C通讯的状态。
::: details 硬件实现I2C代码封装
```c 硬件实现I2C代码封装.c
#include "stm32f10x.h"
#include "MPU6050_Reg.h"
#include "stm32f10x_i2c.h"

#define MPU6050_Address 0xD0

uint8_t MPU6050_ReadReg(uint8_t address) {
    I2C_GenerateSTART(I2C2, ENABLE);
    while (I2C_CheckEvent(I2C2, I2C_EVENT_MASTER_MODE_SELECT) != SUCCESS);  // 等待EV5

    I2C_Send7bitAddress(I2C2, MPU6050_Address, I2C_Direction_Transmitter);
    while (I2C_CheckEvent(I2C2, I2C_EVENT_MASTER_TRANSMITTER_MODE_SELECTED) != SUCCESS);  // 等待EV6

    I2C_SendData(I2C2, address);
    while (I2C_CheckEvent(I2C2, I2C_EVENT_MASTER_BYTE_TRANSMITTING) != SUCCESS);    // 等待EV8事件


    I2C_GenerateSTART(I2C2, ENABLE);
    while (I2C_CheckEvent(I2C2, I2C_EVENT_MASTER_MODE_SELECT) != SUCCESS);  // 等待EV5

    I2C_Send7bitAddress(I2C2, MPU6050_Address, I2C_Direction_Receiver);
    while (I2C_CheckEvent(I2C2, I2C_EVENT_MASTER_RECEIVER_MODE_SELECTED) != SUCCESS);  // 等待EV6(接收模式)

    // 根据STM32硬件I2C外设的设计特性，必须在数据的第一个字节接收开始之前设置好应答位，不能等到接收了才设置，否则针对的是下一个字节
    I2C_AcknowledgeConfig(I2C2,DISABLE);
    I2C_GenerateSTOP(I2C2, ENABLE);

    while(I2C_CheckEvent(I2C2,I2C_EVENT_MASTER_BYTE_RECEIVED)!=SUCCESS);    // 等待EV7
    uint8_t value = I2C_ReceiveData(I2C2);
    I2C_AcknowledgeConfig(I2C2,ENABLE);

    return value;
}

void MPU6050_WriteReg(uint8_t address, uint8_t value) {
    I2C_GenerateSTART(I2C2, ENABLE);
    while (I2C_CheckEvent(I2C2, I2C_EVENT_MASTER_MODE_SELECT) != SUCCESS);  // 等待EV5

    I2C_Send7bitAddress(I2C2, MPU6050_Address, I2C_Direction_Transmitter);
    while (I2C_CheckEvent(I2C2, I2C_EVENT_MASTER_TRANSMITTER_MODE_SELECTED) != SUCCESS);  // 等待EV6

    I2C_SendData(I2C2, address);
    while (I2C_CheckEvent(I2C2, I2C_EVENT_MASTER_BYTE_TRANSMITTING) != SUCCESS);    // 等待EV8事件

    I2C_SendData(I2C2, value);
    while (I2C_CheckEvent(I2C2, I2C_EVENT_MASTER_BYTE_TRANSMITTING) != SUCCESS);    // 等待EV8事件

    I2C_GenerateSTOP(I2C2, ENABLE);
}

void MPU6050_GetData(int16_t *arr) {}

void MPU6050_Init(){
	/*开启时钟*/
	RCC_APB1PeriphClockCmd(RCC_APB1Periph_I2C2, ENABLE);		//开启I2C2的时钟
	RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);		//开启GPIOB的时钟

	/*GPIO初始化*/
	GPIO_InitTypeDef GPIO_InitStructure;
	GPIO_InitStructure.GPIO_Mode = GPIO_Mode_AF_OD;
	GPIO_InitStructure.GPIO_Pin = GPIO_Pin_10 | GPIO_Pin_11;
	GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
	GPIO_Init(GPIOB, &GPIO_InitStructure);					//将PB10和PB11引脚初始化为复用开漏输出

	/*I2C初始化*/
	I2C_InitTypeDef I2C_InitStructure;						//定义结构体变量
	I2C_InitStructure.I2C_Mode = I2C_Mode_I2C;				//模式，选择为I2C模式
	I2C_InitStructure.I2C_ClockSpeed = 50000;				//时钟速度，选择为50KHz
	I2C_InitStructure.I2C_DutyCycle = I2C_DutyCycle_2;		//时钟占空比，选择Tlow/Thigh = 2（实际仅在快速模式下生效）
	I2C_InitStructure.I2C_Ack = I2C_Ack_Enable;				//应答，选择使能
	I2C_InitStructure.I2C_AcknowledgedAddress = I2C_AcknowledgedAddress_7bit;	//应答地址，选择7位，从机模式下才有效
	I2C_InitStructure.I2C_OwnAddress1 = 0x00;				//自身地址，从机模式下才有效
	I2C_Init(I2C2, &I2C_InitStructure);						//将结构体变量交给I2C_Init，配置I2C2

	/*I2C使能*/
	I2C_Cmd(I2C2, ENABLE);									//使能I2C2，开始运行

	/*MPU6050寄存器初始化，需要对照MPU6050手册的寄存器描述配置，此处仅配置了部分重要的寄存器*/
	MPU6050_WriteReg(MPU6050_PWR_MGMT_1, 0x01);				//电源管理寄存器1，取消睡眠模式，选择时钟源为X轴陀螺仪
	MPU6050_WriteReg(MPU6050_PWR_MGMT_2, 0x00);				//电源管理寄存器2，保持默认值0，所有轴均不待机
	MPU6050_WriteReg(MPU6050_SMPLRT_DIV, 0x09);				//采样率分频寄存器，配置采样率
	MPU6050_WriteReg(MPU6050_CONFIG, 0x06);					//配置寄存器，配置DLPF
	MPU6050_WriteReg(MPU6050_GYRO_CONFIG, 0x18);			//陀螺仪配置寄存器，选择满量程为±2000°/s
	MPU6050_WriteReg(MPU6050_ACCEL_CONFIG, 0x18);			//加速度计配置寄存器，选择满量程为±16g
}
```
:::

## SPI通信协议
SPI是一种全双工通信协议，相比I2C的低速传输（最快约5Mbps），SPI能达到的理论传输速度超过100Mbps
SPI需要四条线，分别为SS、MOSI、MISO和SCL，其特点如下：
* SS：标志传输的开始和结束，SS从高电平跳变到低电平表示传输起始，在整个传输过程中均保持低电平状态，跳变到高电平表示传输结束
* MOSI：主机输出，从机输入
* MISO：主机输入，从机输出
* SCK：时钟线，不同模式下有不同的传输规则

SPI在硬件端使用两个移位寄存器来实现全双工通信。以主机发送为例，当主机高位的bit被移出时会通过MOSI来到从机的低位，与此同时从机高位的bit也会通过MISO移动到主机的低位。如果仅主机发送而从机不接收，从机发来的通常是0xFF的占位符，同样如果主机接收而不发送，主机发出的也是0xFF。具体传输模型如下图所示：

<img src="/MCU/SPI/SPI_Model.png" alt="图片加载失败" width="600">
<div><center>SPI数据传输模型</center></div>
<div><center>图片来自<a href="https://jiangxiekeji.com/index.html" target="block">江协科技</a>B站视频stm32入门教程，<a href="https://www.bilibili.com/video/BV1th411z7sn?spm_id_from=333.788.videopod.episodes&vd_source=f0f9f2df6f5c66192f95d51f38e382f1" target="block">跳转链接</a></center></div>

SPI时序基本单元共有四种模式：
* 模式零（最常用）：
  * CPOL = 0：空闲状态时，SCK为低电平
  * CPHA = 0：SCK第一个边沿移入数据，第二个边沿移出数据
* 模式一：
  * CPOL = 0：空闲状态时，SCK为低电平
  * CPHA = 0：SCK第一个边沿移出数据，第二个边沿移入数据
* 模式二：
  * CPOL = 1：空闲状态时，SCK为高电平
  * CPHA = 1：SCK第一个边沿移出数据，第二个边沿移入数据
* 模式三：
  * CPOL = 1：空闲状态时，SCK为高电平
  * CPHA = 0：SCK第一个边沿移入数据，第二个边沿移出数据

<img src="/MCU/SPI/SPI_Mode_0.png" alt="图片加载失败" width="600">
<div><center>SPI数据传输模型</center></div>
<div><center>图片来自<a href="https://jiangxiekeji.com/index.html" target="block">江协科技</a>B站视频stm32入门教程，<a href="https://www.bilibili.com/video/BV1th411z7sn?spm_id_from=333.788.videopod.episodes&vd_source=f0f9f2df6f5c66192f95d51f38e382f1" target="block">跳转链接</a></center></div>

在模式零下，由于SCK产生第一个边沿时就要移入数据，故MOSI必须在此之前把数据准备好，因此当SS产生下降沿时，MOSI就要进行第一次电平跳变，同时MISO解除高阻抗状态。因为此时MISO还没接收到数据，故MISO引脚的电平可以任意指定。在SCK产生上升沿后的某个窗口期（极短）内，从机从MOSI数据线读入1bit，同时主机也从MISO线获取1bit，这样就完成了一位的传输。待SCK从高电平跳变到低电平后，MOSI和MISO各自准备好新的数据等待下一次高电平时双方读取。其他模式因不常用暂时不记录。

### W25Q64简要介绍
W25Q64是一款Flash存储芯片，有8MB存储空间，使用24位地址（实际只需要23位，即从0000H~7000H）。这8MB存储空间被分成128块，每块64KB，每个块又被分成16个扇区，每个扇区4KB，每个扇区还被分成16页，每页256字节。故该芯片共有128个块，128\*16=2048个扇区，2048\*16=65536个页。

W25Q64各引脚功能如下：
* CS（SS）：SPI片选
* CLK（SCK）：SPI时钟
* DI（MOSI）：SPI主机输出从机输入
* DO（MISO）：SPI从机输出主机输入
* WP：写保护
* HOLD：数据保持

W25Q64方框图如下所示：

<img src="/MCU/SPI/W25Q64_方框图.png" alt="图片加载失败" width="600">
<div><center>W25Q64_方框图</center></div>
<div><center>图片来自<a href="https://jiangxiekeji.com/index.html" target="block">江协科技</a>B站视频stm32入门教程，<a href="https://www.bilibili.com/video/BV1th411z7sn?spm_id_from=333.788.videopod.episodes&vd_source=f0f9f2df6f5c66192f95d51f38e382f1" target="block">跳转链接</a></center></div>

* Write Control Logic：写保护。高电平表示允许写入和读取，低电平仅允许读取
* Status Register：状态寄存器。记录芯片是否处于忙状态、是否写使能、写保护等
* High Voltage Generators：高电压发生器，用于实现掉电数据不丢失功能
* Page Address Latch：页地址锁存器。由于总共有65536个页，故需16位（2B）才能完整表示，即该锁存器接收两个字节（MISO传入地址的前两个）
* Byte Address Latch：字节地址锁存器。存储的是计组层面的“块内地址”，在这里指页内地址。由于每页256字节，故需8位（1B）就能完整表示整页

Flash操作注意事项：
* <font color="gray">Flash不同于RAM，不能“指哪打哪”，我们实际上操作的是Page Buffer页缓存（RAM），待写入结束后要等待一段时间让控制器把数据写进Flash，因此在写Flash结束前不能再传新的数据</font>
* 写入操作时：
  * 写入操作前，必须先进行写使能
  * 每个数据位只能由1改成0，不能从0改成1
  * 写入数据前必须先擦除，擦除后所有数据位变成1
  * 擦除必须按最小擦除单元进行
  * 连续写入多字节时，最多写入一页的数据，超过页尾位置的数据会覆盖到页首写入
  * 写入操作结束后芯片进入忙状态，不响应新的读写操作
* 读取操作时：直接调用读取时序，无需使能，没有页的限制，读取操作结束后也不会进入忙状态但在忙状态时不能进行读操作

### SPI外设简介
* STM32内部集成了硬件SPI收发电路，可以由硬件自动执行时钟生成、数据收发等功能，减轻CPU负担
* 可配置8位/16位数据帧，高位/低位先行
* 时钟频率f<sub>PCLK</sub>（即APBx）/（2,4,8,16,32,64,128）
* 支持多主机模型、主或从操作
* 可精简为半双工/单工通信
* 支持DMA且兼容I<hub>2</hub>S协议（中容量产品不支持）

##### 部分硬件传输细节
|英文缩写|实际含义|
|:---:|:---:|
|TXE|高电平指示TDR为空，低电平为满|
|TDR|发送缓冲器，可用于暂存要发送的数据|
|RDR|接收缓冲器，可用于暂存要读取的数据|
|BSY|高电平表示数据传输中，低电平表示不在传输状态|
|RXNE|低电平表示尚未收到数据，高电平表示已收到数据|
|Dx|要发送的数据|

注意：TXE和RXNE由硬件设置，由软件清除；BSY由硬件设置由硬件清除

硬件SPI在主模式下分成两种模式，全双工连续传输和全双工非连续传输：
* 全双工连续传输过程细节如下：
  1. TXE = 1，表示TDR没有数据，CPU把D1送入TDR，置TXE = 0
  2. 由于此时移位寄存器为空，TDR直接把D1送入移位寄存器，MOSI和SCK开始产生D1的时序波形，TDR重新置空，TXE = 1。而MOSI和SCK产生完对应时序波形后MISO也接收到了对应数据，此时硬件置RXNE = 1，RDR保存当前接收到的数据。当读出数据后，RXNE将被CPU置0。<font color="pink">*需要注意的是由于SPI协议的特性，收发是同时进行的，故直到最后一个数据位传输完毕才能接收到完整的从机响应。此时RXNE = 1，RDR保存最后一个数据*</font>
  3. 为保证连续传输，D2会被写入TDR，TXE = 0
  4. 待D1传输完毕后，D2转入移位寄存器，TDR置空，TXE = 1。此时会再将转入D3，重新回到步骤1。如果只打算发送3个数据则D3送入移位寄存器后TXE = 1会一直持续，最后由硬件清除BSY标志，传输结束
* 全双工非连续传输过程细节如下：
  1. 同连续传输，TXE = 1，表示TDR没有数据，CPU把D1送入TDR，置TXE = 0
  2. TDR同样直接把数据送入移位寄存器，但因为非连续传输，故不会立刻把数据再送入TDR，此时TXE = 1会一直持续到RXNE = 1，读出数据后CPU置RXNE = 0，再把数据写入TDR，又因为移位寄存器此时为空，数据会再被送入移位寄存器，以此类推
  3. 需要注意的是BSY标志会在没有产生MOSI波形时置0，产生MOSI波形时置1，和连续传输的发送期间一直持续为1是完全不同的
::: details 硬件SPI代码
```c 硬件SPI代码.c
#include "stm32f10x.h"                  // Device header

/**
  * 函    数：SPI写SS引脚电平，SS仍由软件模拟
  * 参    数：BitValue 协议层传入的当前需要写入SS的电平，范围0~1
  * 返 回 值：无
  * 注意事项：此函数需要用户实现内容，当BitValue为0时，需要置SS为低电平，当BitValue为1时，需要置SS为高电平
  */
void MySPI_W_SS(uint8_t BitValue)
{
	GPIO_WriteBit(GPIOA, GPIO_Pin_4, (BitAction)BitValue);		//根据BitValue，设置SS引脚的电平
}

/**
  * 函    数：SPI初始化
  * 参    数：无
  * 返 回 值：无
  */
void MySPI_Init(void)
{
	/*开启时钟*/
	RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE);	//开启GPIOA的时钟
	RCC_APB2PeriphClockCmd(RCC_APB2Periph_SPI1, ENABLE);	//开启SPI1的时钟

	/*GPIO初始化*/
	GPIO_InitTypeDef GPIO_InitStructure;
	GPIO_InitStructure.GPIO_Mode = GPIO_Mode_Out_PP;
	GPIO_InitStructure.GPIO_Pin = GPIO_Pin_4;
	GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
	GPIO_Init(GPIOA, &GPIO_InitStructure);					//将PA4引脚初始化为推挽输出

	GPIO_InitStructure.GPIO_Mode = GPIO_Mode_AF_PP;
	GPIO_InitStructure.GPIO_Pin = GPIO_Pin_5 | GPIO_Pin_7;
	GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
	GPIO_Init(GPIOA, &GPIO_InitStructure);					//将PA5和PA7引脚初始化为复用推挽输出

	GPIO_InitStructure.GPIO_Mode = GPIO_Mode_IPU;
	GPIO_InitStructure.GPIO_Pin = GPIO_Pin_6;
	GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
	GPIO_Init(GPIOA, &GPIO_InitStructure);					//将PA6引脚初始化为上拉输入

	/*SPI初始化*/
	SPI_InitTypeDef SPI_InitStructure;						//定义结构体变量
	SPI_InitStructure.SPI_Mode = SPI_Mode_Master;			//模式，选择为SPI主模式
	SPI_InitStructure.SPI_Direction = SPI_Direction_2Lines_FullDuplex;	//方向，选择2线全双工
	SPI_InitStructure.SPI_DataSize = SPI_DataSize_8b;		//数据宽度，选择为8位
	SPI_InitStructure.SPI_FirstBit = SPI_FirstBit_MSB;		//先行位，选择高位先行
	SPI_InitStructure.SPI_BaudRatePrescaler = SPI_BaudRatePrescaler_128;	//波特率分频，选择128分频
	SPI_InitStructure.SPI_CPOL = SPI_CPOL_Low;				//SPI极性，选择低极性
	SPI_InitStructure.SPI_CPHA = SPI_CPHA_1Edge;			//SPI相位，选择第一个时钟边沿采样，极性和相位决定选择SPI模式0
	SPI_InitStructure.SPI_NSS = SPI_NSS_Soft;				//NSS，选择由软件控制
	SPI_InitStructure.SPI_CRCPolynomial = 7;				//CRC多项式，暂时用不到，给默认值7
	SPI_Init(SPI1, &SPI_InitStructure);						//将结构体变量交给SPI_Init，配置SPI1

	/*SPI使能*/
	SPI_Cmd(SPI1, ENABLE);									//使能SPI1，开始运行

	/*设置默认电平*/
	MySPI_W_SS(1);											//SS默认高电平
}

/**
  * 函    数：SPI起始
  * 参    数：无
  * 返 回 值：无
  */
void MySPI_Start(void)
{
	MySPI_W_SS(0);				//拉低SS，开始时序
}

/**
  * 函    数：SPI终止
  * 参    数：无
  * 返 回 值：无
  */
void MySPI_Stop(void)
{
	MySPI_W_SS(1);				//拉高SS，终止时序
}

/**
  * 函    数：SPI交换传输一个字节，使用SPI模式0
  * 参    数：ByteSend 要发送的一个字节
  * 返 回 值：接收的一个字节
  */
uint8_t MySPI_SwapByte(uint8_t ByteSend)
{
	while (SPI_I2S_GetFlagStatus(SPI1, SPI_I2S_FLAG_TXE) != SET);	//等待发送数据寄存器空

	SPI_I2S_SendData(SPI1, ByteSend);								//写入数据到发送数据寄存器，开始产生时序

	while (SPI_I2S_GetFlagStatus(SPI1, SPI_I2S_FLAG_RXNE) != SET);	//等待接收数据寄存器非空

	return SPI_I2S_ReceiveData(SPI1);								//读取接收到的数据并返回
}

```
:::

## BKP备份寄存器和RTC实时时钟
* BKP可用于存储用户空间应用程序数据，当VDD电源被切断，它仍由VBAT维持供电，当系统在待机模式下被唤醒或系统、电源复位时，它们不会被复位
* TAMPER引脚产生的侵入事件将所有备份寄存器内容清除
* RTC引脚输出RTC校准时钟、RTC闹钟脉冲或秒脉冲
* STM32F103C8T6共有10个BKP寄存器，每个2B，BKP在小容量和中容量产品上为20字节，大容量/互联型为84字节（均为总容量）
RTC实时时钟：
* RTC是一个独立的定时器，可为系统提供时钟和日历功能
* RTC和时钟处于系统后备区域，系统复位时数据不清零，VDD断电后可借助VBAT继续计时
* 32位可编程计数器，对应Unix时间戳秒计数器
* 20位可编程预分频器，可适配不同频率时钟输入
* 可选的三个时钟源：
  * HSE外部高速时钟/128（62.5KHz）
  * LSE外部低速时钟（标准，32.768KHz）
  * LSI内部低速时钟（40KHz）

RTC基本运行方框图如下：
<img src="/MCU/RTC.png" alt="图片加载失败" width="600">
<div><center>RTC时钟方框图</center></div>
<div><center>图片来自<a href="https://jiangxiekeji.com/index.html" target="block">江协科技</a>B站视频stm32入门教程，<a href="https://www.bilibili.com/video/BV1th411z7sn?spm_id_from=333.788.videopod.episodes&vd_source=f0f9f2df6f5c66192f95d51f38e382f1" target="block">跳转链接</a></center></div>

需要注意的是PRL重装计数器的值就是DIV余数寄存器每次重装的值，如果PRL设置为32768-1则DIV每次都会被重装成32767，此时再接入外部LSE晶振（32.768KHz）就会变成每秒重装一次，即CNT的值每秒加1。

RTC操作注意事项：
* 执行以下操作将使能对 BKP 和 RTC 的访问：
  * 设置 RCC_APB1ENR 的 PWREN 和 BKPEN，使能 PWR 和 BKP 时钟
  * 设置 PWR_CR 的 DBP，使能对 BKP 和 RTC 的访问
* 若在读取 RTC 寄存器时，RTC 的 APB1 接口曾经处于禁止状态，则软件首先必须等待 RTC_CRL 寄存器中的 RSF 位（寄存器同步标志）被硬件置 1
  必须设置 RTC_CRL 寄存器中的 CNF 位，使 RTC 进入配置模式后，才能写入 RTC_PRL、RTC_CNT、RTC_ALR 寄存器
* 对 RTC 任何寄存器的写操作，都必须在前一次写操作结束后进行。可以通过查询 RTC_CR 寄存器中的 RTOFF 状态位，判断 RTC 寄存器是否处于更新中。仅当 RTOFF 状态位是 1 时，才可以写入 RTC 寄存器

即：若要读取RTC时钟需等待一个RTC_CRL_CNF位，若要写RTC时钟也要等一个RTOFF位
::: details BKP实现代码
```c main.c
/* 非常简单 */
    OLED_Init();
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_PWR, ENABLE);
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_BKP, ENABLE);

    PWR_BackupAccessCmd(ENABLE);

    BKP_WriteBackupRegister(BKP_DR1, 0x1234);
    OLED_ShowHexNum(1, 1, BKP_ReadBackupRegister(BKP_DR1), 4);
```
:::

::: details RTC时钟实现代码
```c main.c
#include "MyRTC.h"
#include "OLED.h"
#include "stm32f10x.h"
#include "time.h"

int main() {
    struct tm time_structure;
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_PWR, ENABLE);
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_BKP, ENABLE);
    OLED_Init();

    PWR_BackupAccessCmd(ENABLE);

    RCC_LSEConfig(RCC_LSE_ON);
    while (!RCC_GetFlagStatus(RCC_FLAG_LSERDY));

    RCC_RTCCLKConfig(RCC_RTCCLKSource_LSE);
    RCC_RTCCLKCmd(ENABLE);

    RTC_WaitForSynchro();
    RTC_WaitForLastTask();

    // 设置32768分频，在32.768KHz下每秒振动1次
    RTC_SetPrescaler(32768 - 1);
    RTC_WaitForLastTask();

    // 如果没有检测到0xCC就设置0xCC标志，同时重置时间
    uint16_t signal = BKP_ReadBackupRegister(BKP_DR1);
    if (signal != 0xCC) {
        MyRTC_SetCounter();
        BKP_WriteBackupRegister(BKP_DR1, 0xCC);
    }

    OLED_ShowString(1, 1, "Date:XXXX-XX-XX");
    OLED_ShowString(2, 1, "Time:XX:XX:XX");

    while (1) {
        time_t time_cnt = RTC_GetCounter();
        RTC_WaitForLastTask();
        time_structure = *localtime(&time_cnt);
        OLED_ShowNum(1, 6, time_structure.tm_year + 1900, 4);
        OLED_ShowNum(1, 11, time_structure.tm_mon + 1, 2);
        OLED_ShowNum(1, 14, time_structure.tm_mday, 2);
        OLED_ShowNum(2, 6, time_structure.tm_hour, 2);
        OLED_ShowNum(2, 9, time_structure.tm_min, 2);
        OLED_ShowNum(2, 12, time_structure.tm_sec, 2);
    }
}
```
```c MyRTC.c
#include "stm32f10x.h"
#include "time.h"

// 以2026年5月19日12点13分0秒为时间戳
uint16_t Date[] = {2026, 5, 19, 12, 13, 0};
void MyRTC_SetCounter() {
    time_t cnt;
    struct tm time_struct;
    time_struct.tm_year = Date[0] - 1900;
    time_struct.tm_mon = Date[1] - 1;
    time_struct.tm_mday = Date[2];
    time_struct.tm_hour = Date[3];
    time_struct.tm_min = Date[4];
    time_struct.tm_sec = Date[5];
    // mktime把struct tm结构体转换成时间戳
    cnt = mktime(&time_struct);

    RTC_SetCounter(cnt);
    RTC_WaitForLastTask();
}
```
:::

## WDG看门狗
* 看门狗可以监控程序的运行状态，当程序因为设计漏洞、硬件故障、电磁干扰等原因出现卡死或跑飞等现象时，看门狗能及时复位程序，保证系统的可靠性和安全性
* 看门狗本质上是一个定时器，当在指定时间范围内程序没有执行喂狗（重置计数器）操作时，看门狗硬件电路就自动产生复位信号
* STM32内置两个看门狗：
  * 独立看门狗（IWDG）：独立工作，对时间精度要求低
  * 窗口看门狗（WWDG）：要求看门狗在精确计时窗口起作用
* IWDG键寄存器：
  * 键寄存器本质是控制寄存器，用于控制硬件电路工作
  * 在可能存在干扰的情况下，一般通过在整个键寄存器写入特定值来代替控制寄存器写入一位的功能以降低电路受干扰的概率

|写入键寄存器的值|作用|
|:---:|:---:|
|0xCCCC|启动独立看门狗|
|0xAAAA|IWDG_RLR的值重新加载到计数器（喂狗）|
|0x5555|解除IWDG_PR和IWDG_RLR的写保护|
|0x5555以外的值|启用IWDG_PR和IWDG_RLR的写保护|

IWDG运行框图如下：
<img src="/MCU/WDG/IWDG.png" alt="图片加载失败" width="600">
<div><center>IWDG框图</center></div>
<div><center>图片来自<a href="https://jiangxiekeji.com/index.html" target="block">江协科技</a>B站视频stm32入门教程，<a href="https://www.bilibili.com/video/BV1th411z7sn?spm_id_from=333.788.videopod.episodes&vd_source=f0f9f2df6f5c66192f95d51f38e382f1" target="block">跳转链接</a></center></div>

LSI内部低速晶振的40KHz频率经分频器分频后得到对应频率并作用于递减计数器，当递减计数器减至零后看门狗发出IWDG复位信号。在此之前可通过向键寄存器写入特定数据进行喂狗，执行操作后IWDG_RLR重装载寄存器的值会覆盖递减计数器的值。需要注意的是看门狗一旦启动就不能关闭了。IWDG看门狗计时规则如下图所示：
<img src="/MCU/WDG/IWDG_Rule.png" alt="图片加载失败" width="600">
<div><center>IWDG超时时间</center></div>
<div><center>图片来自<a href="https://jiangxiekeji.com/index.html" target="block">江协科技</a>B站视频stm32入门教程，<a href="https://www.bilibili.com/video/BV1th411z7sn?spm_id_from=333.788.videopod.episodes&vd_source=f0f9f2df6f5c66192f95d51f38e382f1" target="block">跳转链接</a></center></div>

::: details IWDG实现代码
```c main.c
#include "Delay.h"
#include "OLED.h"
#include "stm32f10x.h"
#include "Key.h"

int main() {
    OLED_Init();
    OLED_ShowString(1, 1, "IWDG");
    IWDG_WriteAccessCmd(IWDG_WriteAccess_Enable);
    IWDG_SetPrescaler(IWDG_Prescaler_16);
    IWDG_SetReload(2500 - 1);
    // 使能之前喂一下狗
    IWDG_ReloadCounter();
    IWDG_Enable();
    // RCC_FLAG_IWDGRST的值取决于上次复位的原因，因为看门狗复位就等于1，否则等于0
    // 要明显观察此现象可以考虑把看门狗时间变长一些，1638.4ms足够
    if (RCC_GetFlagStatus(RCC_FLAG_IWDGRST)) {
        OLED_ShowString(3, 1, "IWDG_RST");
        Delay_ms(500);
        OLED_ShowString(3, 1, "        ");
        Delay_ms(500);
        RCC_ClearFlag();
    } else {
        OLED_ShowString(2, 1, "RST");
        Delay_ms(500);
        OLED_ShowString(2, 1, "   ");
        Delay_ms(500);
    }
    while (1) {
        GetKey_A0();
        IWDG_ReloadCounter();
        OLED_ShowString(4, 1, "FEED");
        Delay_ms(500);
        OLED_ShowString(4, 1, "    ");
        Delay_ms(500);
    }
}
```
```c Key.c
#include "Delay.h"
#include "stm32f10x.h"

void GetKey_A0() {
    RCC_APB2PeriphClockCmd(GPIOA, ENABLE);
    GPIO_InitTypeDef GPIO_InitStruct;
    GPIO_InitStruct.GPIO_Mode = GPIO_Mode_IPU;
    GPIO_InitStruct.GPIO_Pin = GPIO_Pin_0;
    GPIO_InitStruct.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &GPIO_InitStruct);

    // 检测到引脚电平被拉低后等待20ms跳过波动阶段，然后如果低电平稳定就阻塞
    if (!GPIO_ReadInputDataBit(GPIOA, GPIO_Pin_0)) {
        Delay_ms(20);
        while (!GPIO_ReadInputDataBit(GPIOA, GPIO_Pin_0));
    }
}
```
:::

WWDG运行框图如下：
<img src="/MCU/WDG/WWDG.png" alt="图片加载失败" width="600">
<div><center>WWDG运行框图</center></div>
<div><center>图片来自<a href="https://jiangxiekeji.com/index.html" target="block">江协科技</a>B站视频stm32入门教程，<a href="https://www.bilibili.com/video/BV1th411z7sn?spm_id_from=333.788.videopod.episodes&vd_source=f0f9f2df6f5c66192f95d51f38e382f1" target="block">跳转链接</a></center></div>

和IWDG不同，WWDG要求在某个精确的时间窗口内喂狗，太早太晚都不行。它的运行过程大致如下：首先我们使能WWDG并配置好WWDG_CFR，WDGA会默认等于1，接下来写入WWDG_CR，当WWDG_CR在大于WWDG_CFR时被喂狗，比较器输出1，高电平通过与门->或门->与门产生复位信号；当T6:0小于0x40时，低电平信号T6 = 0经非门->或门->与门后产生复位信号。因此无论太早或是太晚喂狗都会产生复位信号。

WWDG超时时间：
<img src="/MCU/WDG/WWDG_Rule.png" alt="图片加载失败" width="600">
<div><center>WWDG超时时间</center></div>
<div><center>图片来自<a href="https://jiangxiekeji.com/index.html" target="block">江协科技</a>B站视频stm32入门教程，<a href="https://www.bilibili.com/video/BV1th411z7sn?spm_id_from=333.788.videopod.episodes&vd_source=f0f9f2df6f5c66192f95d51f38e382f1" target="block">跳转链接</a></center></div>


WWDG工作特性总结如下：
* 递减计数器T[6:0]的值小于0x40时，WWDG产生复位
* 递减计数器T[6:0]在窗口W[6:0]外被重新装载时，WWDG产生复位
* 递减计数器T[6:0]等于0x40时可以产生早期唤醒中断（EWI），用于重装载计数器以避免WWDG复位
* 定期写入WWDG_CR寄存器防止看门狗饿死（复位）

::: details WWDG实现代码
```c main.c
#include "Delay.h"
#include "OLED.h"
#include "stm32f10x.h"

int main() {
    OLED_Init();
    OLED_Clear();

    // 在看门狗开启之前提示上一次的复位情况，持续一秒
    if (RCC_GetFlagStatus(RCC_FLAG_WWDGRST)) {
        OLED_ShowString(3, 1, "WWDGRST");
        Delay_ms(50);
        OLED_ShowString(3, 1, "       ");
    }

    RCC_APB1PeriphClockCmd(RCC_APB1Periph_WWDG, ENABLE);
    WWDG_SetPrescaler(WWDG_Prescaler_8);
    // 对应窗口时间30ms，即写入WWDG_CR时如果WWDG_CR > 30触发窗口看门狗复位
    WWDG_SetWindowValue(0x40 | 21);
    // 对应超时时间50ms，如果过50ms还不喂狗，触发看门狗复位
    WWDG_Enable(0x40 | 54);

    while (1) {
        OLED_ShowString(4, 1, "Feed");
        Delay_ms(15);
        OLED_ShowString(4, 1, "    ");
        Delay_ms(15);
        WWDG_SetCounter(0x40 | 54);
    }
}
```
:::

::: tip
**<font color="red">注意，看门狗的逻辑是“持续一段时间没有喂狗”，即“超出了这段时间后，剩下的代码都没机会执行”。因此看门狗的OLED显示必须写成这样：</font>**
```c chunk
if (RCC_GetFlagStatus(RCC_FLAG_WWDGRST)) {
    OLED_ShowString(3, 1, "WWDGRST");
    Delay_ms(50);
    // 此处必须清除
    OLED_ShowString(3, 1, "       ");
}
```
原因是RCC_GetFlagStatus(RCC_FLAG_WWDGRST)获取上一次的状态后，如果这次正常那WWDGRST就不应该显示出来，如果还不正常，RCC_GetFlagStatus(RCC_FLAG_WWDGRST)会保持为1且每次复位都会先执行这段判断逻辑，外在表现就是WWDGRST不断闪烁。

如果想向用户提示上一次因为看门狗原因复位了，可以在看门狗开启之前让OLED显示停留一段时间，就像这样：
```c chunk.c
int main() {
    OLED_Init();
    OLED_Clear();

    // 在看门狗开启之前提示上一次的复位情况，持续一秒
    if (RCC_GetFlagStatus(RCC_FLAG_WWDGRST)) {
        OLED_ShowString(3, 1, "WWDGRST");
        // 提示一秒钟
        Delay_ms(1000);
        OLED_ShowString(3, 1, "       ");
    }

    ...
    // 不限于WWDG或IWDG
    WWDG_Enable(0x40 | 54);
    ...
}
```
此时看门狗尚未开启，故不会因为Delay_ms(1000)没有喂狗而复位，可以正常进行展示，展示完毕后擦除。如果一直产生复位，WWDGRST会呈现亮一秒钟->灭->看门狗超时复位->亮一秒钟->灭的循环
:::
