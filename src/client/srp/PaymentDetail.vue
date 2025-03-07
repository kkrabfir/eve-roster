<!--

Page for displaying details about a specific payment: its status, involved
losses, etc.

-->

<template>
  <app-page :identity="identity" :content-width="1100">
    <div class="title">SRP #{{ srpId }}</div>

    <loading-spinner :promise="promise" display="block" size="34px" />

    <template v-if="payment != null">
      <div class="section-title">Status</div>
      <div class="status-section">
        <div v-if="!payment.paid" class="pending-message">
          Approved, awaiting payment.
        </div>
        <div v-else>
          Paid to
          <router-link
            class="stat-link"
            :to="`/character/${payment.recipient}`"
          >
            {{ name(payment.recipient) }}
          </router-link>
          on
          <span style="color: #cdcdcd">{{ payment.modifiedLabel }}</span>
          by
          <router-link class="stat-link" :to="`/character/${payment.payer}`">
            {{ name(payment.payer) }} </router-link
          >.

          <a v-if="canEditSrp" class="undo-link" @click="onUndoClick"> Undo </a>
          <loading-spinner
            display="inline"
            default-state="hidden"
            :promise="undoPromise"
          />
        </div>
      </div>

      <div class="section-title">Losses</div>
      <loss-heading />
      <loss-row
        v-for="loss in losses"
        :key="loss.killmail"
        :srp="loss"
        :has-edit-priv="canEditSrp"
        :start-in-edit-mode="false"
      />
      <div class="total-row">
        <div class="total-label">Total</div>
        <div class="total-value">
          <span>{{ totalPayout }}</span>
          <span class="denom">ISK</span>
        </div>
      </div>
    </template>
  </app-page>
</template>

<script lang="ts">
import AppPage from "../shared/AppPage.vue";
import LoadingSpinner from "../shared/LoadingSpinner.vue";
import LossHeading from "./LossHeading.vue";
import LossRow from "./LossRow.vue";

import { Loss, Payment } from "./types";

import ajaxer from "../shared/ajaxer";
import { NameCacheMixin } from "../shared/nameCache";

import { Identity } from "../home";

const UNDO_STATUSES = ["inactive", "saving", "error"] as const;
type UndoStatus = (typeof UNDO_STATUSES)[number];

import { defineComponent, PropType } from "vue";
export default defineComponent({
  components: {
    AppPage,
    LoadingSpinner,
    LossHeading,
    LossRow,
  },

  mixins: [NameCacheMixin],

  props: {
    identity: { type: Object as PropType<Identity>, required: true },
    srpId: { type: Number, required: true },
  },

  data() {
    return {
      payment: null,
      losses: [],
      undoStatus: "inactive",
      promise: null,
      undoPromise: null,
    } as {
      payment: Payment | null;
      losses: Loss[];
      undoStatus: UndoStatus;
      promise: Promise<any> | null;
      undoPromise: Promise<any> | null;
    };
  },

  computed: {
    totalPayout(): string {
      let sum = 0;
      for (let loss of this.losses) {
        sum += loss.payout;
      }
      return sum.toLocaleString(undefined, {
        minimumFractionDigits: 2,
      });
    },

    canEditSrp(): boolean {
      return this.identity.access["srp"] == 2;
    },
  },

  mounted() {
    this.fetchData();
  },

  methods: {
    fetchData() {
      this.payment = null;
      this.losses = [];
      const promise = ajaxer.getSrpPayment(this.srpId);
      this.promise = promise;
      promise.then((response) => {
        this.addNames(response.data.names);
        this.payment = response.data.payment;
        this.losses = response.data.losses;
      });
    },

    onUndoClick() {
      if (this.undoStatus == "saving") {
        return;
      }
      this.undoStatus = "saving";
      const undoPromise = ajaxer.putSrpPaymentStatus(
        this.srpId,
        false,
        undefined
      );
      this.undoPromise = undoPromise;
      undoPromise
        .then((_response) => {
          this.undoStatus = "inactive";
          if (this.payment != null) {
            this.payment.paid = false;
          }
          this.fetchData();
        })
        .catch(() => {
          this.undoStatus = "error";
        });
    },
  },
});
</script>

<style scoped>
.title {
  font-size: 30px;
  color: #a7a29c;
  font-weight: 100;
  margin: 40px 0 40px 0;
}

.section-title {
  font-size: 18px;
  color: #a7a29c;
  margin-top: 40px;
  margin-bottom: 15px;
}

.status-section {
  font-size: 14px;
  color: #a7a29c;
}

.stat-link {
  color: #cdcdcd;
  text-decoration: none;
}

.stat-link:hover {
  text-decoration: underline;
}

.undo-link {
  color: #8b8b8b;
  text-decoration: none;
  margin-left: 15px;
  cursor: pointer;
}

.undo-link:hover {
  text-decoration: underline;
}

.total-row {
  display: flex;
  margin-top: 31px;
  justify-content: flex-end;
  font-size: 14px;
  color: #cdcdcd;
}

.total-value {
  margin-right: 111px;
  width: 266px;
  text-align: right;
}

.denom {
  color: #8b8b8b;
}
</style>
