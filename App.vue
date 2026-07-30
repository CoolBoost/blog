<script lang="ts" setup>
import { useUtterances } from "./composables/use-utterances";
import { useScriptTag } from '@vueuse/core'

useScriptTag('//cdn.busuanzi.cc/busuanzi/3.6.9/busuanzi.abbr.min.js')
useUtterances({
  /**
   * use your repo
   */
  repo: "CoolBoost/website-notes",
  issueTerm: "pathname",
  label: "utterances",
});

</script>

<template>
  <!-- try it -->
  <div />
</template>
