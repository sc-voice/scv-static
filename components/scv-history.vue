<template>
  <div class="scv-nav-sutta" v-if="sutta && sutta.sutta_uid">
    <v-btn v-if="previous" small text
       class="scv-text-btn scv-nav-btn"
        @click="clickSutta(previous)"
    > {{previous.sutta_uid}}/{{previous.lang}}</v-btn>
    <v-icon v-else class="scv-nav-btn-disabled">{{mdiChevronLeft}}</v-icon>

    <div class="scv-suttacentral"
      @mouseover="suttacentral=true" @mouseleave="suttacentral=false">
      <a v-if="suttacentral"
        :href="`https://suttacentral.net/${current.sutta_uid}`"
        target="_blank"> SuttaCentral </a>
      <span v-else >
        {{current.sutta_uid}}/{{current.lang}} </span>
    </div>

    <v-btn v-if="next" small text
      class="scv-text-btn scv-nav-btn"
      @click="clickSutta(next)"
    > {{next.sutta_uid}}/{{next.lang}} </v-btn>
    <v-icon v-else class="scv-nav-btn-disabled">{{mdiChevronRight}}</v-icon>
  </div>
</template>

<script>
import {
  mdiChevronLeft,
  mdiChevronRight,
} from '@mdi/js';

export default {
  components: {
  },
  props: {
  },
  data: function(){
    return {
      mdiChevronLeft,
      mdiChevronRight,
      suttacentral: false,
    };
  },
  async mounted() {
    let { $el } = this;
    this.$nuxt.$on('scv-load-sutta', payload=>{
      $el && $el.scrollIntoView({
        block: "center",
      });
    });
  },
  methods:{
    clickSutta({sutta_uid, lang}) {
        let { history, $store } = this;
        let h = history.find(h=>h.sutta_uid===sutta_uid && h.lang===lang);
        let updateHistory = false;
        $store.dispatch('scv/loadSutta', {sutta_uid, lang, updateHistory});
    },
  },
  computed: {
    previous() {
        let { history, sutta } = this;
        let { sutta_uid, lang } = sutta;
        let iCur = history.findIndex(h=>h.sutta_uid===sutta_uid && h.lang===lang);
        return history[iCur-1];
    },
    current() {
        let { history, sutta } = this;
        let { sutta_uid, lang } = sutta;
        let iCur = history.findIndex(h=>h.sutta_uid===sutta_uid && h.lang===lang);
        return history[iCur] || sutta;
    },
    next() {
        let { history, sutta } = this;
        let { sutta_uid, lang } = sutta;
        let iCur = history.findIndex(h=>h.sutta_uid===sutta_uid && h.lang===lang);
        return history[iCur+1];
    },
    sutta() {
        return this.$store.state.scv.sutta;
    },
    history() {
      return this.$store.state.scv.settings.history;
    },
  },
}
</script>
<style>
</style>
