<script setup lang="ts">
definePageMeta({ middleware: 'user-only' });
import Doctor_card from '~/components/Doctor_card.vue';
import Doctor_counte from '~/components/Doctor_counte.vue';
import Location_Pharmacy from '~/components/Location_Pharmacy.vue';
import Symptom_Categories from '~/components/Symptom_Categories.vue';
import Tele_tutorial from '~/components/tele_tutorial.vue';

</script>

<template>
  <div>
    <Header/>
    <Doctor_card/>
    <Footer/>
  </div>
</template>
