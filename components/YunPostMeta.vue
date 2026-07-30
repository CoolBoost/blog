<script lang="ts" setup>
import type { Post } from "valaxy";
import { useLayout } from "valaxy";
import YunPostMeta from "valaxy-theme-yun/components/YunPostMeta.vue";

defineProps<{
  frontmatter: Post;
}>();

// 仅在 Post 布局显示
const isPost = useLayout("post");
</script>

<template>
  <YunPostMeta :frontmatter="frontmatter">
    <span
      v-if="isPost"
      id="busuanzi_container_page_pv"
      class="inline-flex-center gap-1"
    >
      <div class="inline-block" i-ri-book-open-line></div>
      <span id="busuanzi_page_uv">加载中...</span>
    </span>
  </YunPostMeta>
</template>
