<!--

Table of PaymentHistoryRows.

-->

<template>
  <div class="_payment-history" :class="{ compact: compactMode }">
    <template v-if="payments != null">
      <div class="header">
        <div style="width: 270px; margin-left: 10px">SRP</div>
        <div style="width: 255px">Recipient</div>
        <div style="width: 65px; text-align: right">Losses</div>
        <div style="width: 135px; text-align: right">Total payout</div>
        <div style="flex: 1" />
        <div style="width: 255px">Paid by</div>
      </div>

      <payment-history-row
        v-for="payment in payments"
        :key="payment.id"
        :payment="payment"
      />

      <div v-if="payments.length == 0" class="no-results">No results</div>
    </template>

    <div v-if="suspectMoreToFetch" class="more-cnt">
      <more-button
        :promise="fetchPromise"
        :hide-button="payments == null"
        @fetch-requested="fetchNextResults"
      />
    </div>
  </div>
</template>

<script lang="ts">
import MoreButton from "./MoreButton.vue";
import PaymentHistoryRow from "./PaymentHistoryRow.vue";

import ajaxer from "../shared/ajaxer";
import { NameCacheMixin } from "../shared/nameCache";

import { Payment, Payments } from "./types";

import { Identity } from "../home";
import { AxiosResponse } from "axios";
import { defineComponent, PropType } from "vue";
export default defineComponent({
  components: {
    MoreButton,
    PaymentHistoryRow,
  },

  mixins: [NameCacheMixin],

  props: {
    identity: { type: Object as PropType<Identity>, required: true },
    forAccount: {
      type: Number as PropType<number | undefined>,
      required: false,
      default: undefined,
    },
    compactMode: {
      type: Boolean,
      required: false,
      default: false,
    },
  },

  data() {
    return {
      payments: null,
      fetchPromise: null,
      suspectMoreToFetch: true,
    } as {
      payments: Payment[] | null;
      fetchPromise: Promise<AxiosResponse<Payments>> | null;
      suspectMoreToFetch: boolean;
    };
  },

  computed: {
    resultsPerFetch(): number {
      return this.compactMode ? 3 : 30;
    },

    finalTimestamp(): number | undefined {
      if (!this.payments || this.payments.length == 0) {
        return undefined;
      } else {
        return this.payments[this.payments.length - 1].modified;
      }
    },
  },

  mounted() {
    this.fetchNextResults();
  },

  methods: {
    fetchNextResults() {
      this.fetchPromise = ajaxer.getSrpPaymentHistory({
        paid: this.forAccount ? true : undefined,
        order: "desc",
        orderBy: "modified",
        startingAfter: this.finalTimestamp,
        account: this.forAccount,
        limit: this.resultsPerFetch,
      });

      this.fetchPromise.then((response) => {
        this.addNames(response.data.names);

        this.payments = this.payments || [];
        for (let payment of response.data.payments) {
          this.payments.push(payment);
        }

        this.suspectMoreToFetch =
          response.data.payments.length == this.resultsPerFetch;
      });
    },
  },
});
</script>

<style scoped>
._payment-history {
  margin-bottom: 500px;
}

._payment-history.compact {
  margin-bottom: 20px;
}

.top-line {
  border-bottom: 1px solid #2c2c2c;
}

.header {
  display: flex;
  font-size: 14px;
  color: #a7a29c;
  padding-bottom: 5px;
  border-bottom: 1px solid #2c2c2c;
}

.no-results {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 70px;

  color: #a7a29c;
  font-size: 14px;
  font-style: italic;
}

.more-cnt {
  margin-top: 20px;
  text-align: center;
}
</style>
