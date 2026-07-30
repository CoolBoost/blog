import type { UserThemeConfig } from "valaxy-theme-yun";
import { defineValaxyConfig } from "valaxy";
import Components from "unplugin-vue-components/vite";

// add icons what you will need
const safelist = ["i-ri-home-line"];

/**
 * User Config
 */
export default defineValaxyConfig<UserThemeConfig>({
  // site config see site.config.ts

  vite: {
    plugins: [
      Components({
        // 注册对应目录下的组件
        dirs: ["components", "components/machine"],
      }),
    ],
  },

  theme: "yun",
  themeConfig: {
    // colors: {
    //   /**
    //    * 主题色
    //    * @default '#0078E7'
    //    */
    //   primary: '#1a6840',
    // },
    banner: {
      enable: true,
      title: "棒棒糖前端基地",
    },
    fireworks: {
      enable: false,
    },
    pages: [
      // {
      //   name: '我的小伙伴们',
      //   url: '/links/',
      //   icon: 'i-ri-genderless-line',
      //   color: 'dodgerblue',
      // },
      // {
      //   name: '喜欢的女孩子',
      //   url: '/girls/',
      //   icon: 'i-ri-women-line',
      //   color: 'hotpink',
      // },
    ],

    footer: {
      since: 2024,
      beian: {
        enable: true,
        icp: "闽ICP备2023014871号-1",
        // mps: "闽公网安备35012402000001号",
      },
    },
  },

  unocss: { safelist },
});
