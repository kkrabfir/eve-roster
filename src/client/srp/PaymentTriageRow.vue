<!--

Represents an actionable SRP reimbursement. Contains buttons to open an info
window of the recipient, copy appropriate fields to the clipboard, and mark
the reimbursement as paid.

-->

<template>
  <div class="_pay-flow-row">
    <div class="payment-title">
      <router-link class="title-link" :to="`/srp/payment/${payment.id}`">
        SRP #{{ payment.id }}
      </router-link>
    </div>

    <srp-triplet
      class="recipient-triplet"
      :icon-id="payment.recipient"
      icon-type="Character"
      :top-line="name(payment.recipient)"
      :bottom-line="name(payment.recipientCorp)"
      :icon-href="`/character/${payment.recipient}`"
      :top-href="`/character/${payment.recipient}`"
    />

    <div class="payout-cnt">
      <span class="copy-label">Amount</span>
      <input
        ref="payoutInput"
        class="payout-input"
        readonly
        :value="payment.totalPayout"
      />
      <button class="copy-btn" @click="onCopyPayoutClick">
        Copy &amp; Open
      </button>
    </div>

    <div class="reason-cnt">
      <span class="copy-label">Reason</span>
      <input
        ref="reasonInput"
        class="reason-input"
        readonly
        :value="'SRP #' + payment.id"
      />
      <button class="copy-btn" @click="onCopyReasonClick">Copy</button>
    </div>

    <div class="save-cnt">
      <a v-if="!paid" class="paid-btn" @click="onSaveClick">
        <template v-if="saveStatus == 'inactive'">Paid</template>
        <loading-spinner
          display="inline"
          size="30px"
          default-state="hidden"
          tooltip-gravity="left center"
          :promise="savePromise"
        />
      </a>
      <div v-else class="undo-cnt">
        <a v-if="undoStatus != 'saving'" class="undo-link" @click="onUndoClick">
          Undo
        </a>
        <loading-spinner
          display="inline"
          size="20px"
          default-state="hidden"
          tooltip-gravity="left center"
          :promise="undoPromise"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import LoadingSpinner from "../shared/LoadingSpinner.vue";
import SrpTriplet from "./SrpTriplet.vue";

import ajaxer from "../shared/ajaxer";
import { NameCacheMixin } from "../shared/nameCache";

import { Payment } from "./types";

const STATUSES = ["inactive", "saving", "error"];
type Status = (typeof STATUSES)[number];

import { defineComponent, PropType, ref } from "vue";
export default defineComponent({
  components: {
    LoadingSpinner,
    SrpTriplet,
  },

  mixins: [NameCacheMixin],

  props: {
    payment: { type: Object as PropType<Payment>, required: true },
    payingCharacter: { type: Number as PropType<number | null>, default: null },
  },

  setup: () => {
    const payoutInput = ref<HTMLInputElement>();
    const reasonInput = ref<HTMLInputElement>();
    return { payoutInput, reasonInput };
  },

  data() {
    return {
      paid: false,
      saveStatus: "inactive",
      undoStatus: "inactive",
      savePromise: null,
      undoPromise: null,
    } as {
      paid: boolean;
      saveStatus: Status;
      undoStatus: Status;
      savePromise: Promise<any> | null;
      undoPromise: Promise<any> | null;
    };
  },

  methods: {
    onCopyReasonClick() {
      this.reasonInput?.select();
      try {
        document.execCommand("copy");
      } catch (err) {
        console.log("Error while copying", err);
      }
    },

    onCopyPayoutClick() {
      this.payoutInput?.select();
      try {
        document.execCommand("copy");
      } catch (err) {
        console.log("Error while copying", err);
      }
      if (this.payingCharacter == null) {
        return;
      }
      ajaxer.postOpenInformationWindow(
        this.payingCharacter,
        this.payment.recipient
      );
    },

    onSaveClick() {
      if (this.saveStatus == "saving" || this.payingCharacter == null) {
        return;
      }
      this.saveStatus = "saving";
      const savePromise = ajaxer.putSrpPaymentStatus(
        this.payment.id,
        true,
        this.payingCharacter
      );
      this.savePromise = savePromise;
      savePromise
        .then(() => {
          this.saveStatus = "inactive";
          this.paid = true;
        })
        .catch(() => {
          this.saveStatus = "error";
        });
    },

    onUndoClick() {
      if (this.undoStatus == "saving") {
        return;
      }
      this.undoStatus = "saving";
      const undoPromise = ajaxer.putSrpPaymentStatus(
        this.payment.id,
        false,
        undefined
      );
      this.undoPromise = undoPromise;
      undoPromise
        .then(() => {
          this.undoStatus = "inactive";
          this.paid = false;
        })
        .catch(() => {
          this.undoStatus = "error";
        });
    },
  },
});
</script>

<style scoped>
._pay-flow-row {
  display: flex;
  height: 77px;
  align-items: center;
  border-bottom: 1px solid #2c2c2c;
}

.payment-title {
  font-size: 14px;
  width: 100px;
  margin-left: 10px;
  margin-right: 15px;
}

.title-link {
  color: #cdcdcd;
  text-decoration: none;
}

.title-link:hover {
  text-decoration: underline;
}

.recipient-triplet {
  width: 220px;
  margin-right: 8px;
}

.reason-cnt,
.payout-cnt {
  display: flex;
  align-items: center;
  width: 330px;
}

.copy-label {
  font-size: 14px;
  color: #a7a29c;
  margin-right: 8px;
}

.reason-input,
.payout-input {
  background: #161616;
  border: 1px solid #2d2d2d;
  height: 36px;
  box-sizing: border-box;
  font-size: 14px;
  color: #cdcdcd;
  padding: 0 8px;
}

.reason-input {
  width: 120px;
}

.payout-input {
  width: 120px;
  text-align: right;
}

.copy-btn {
  position: relative;
  left: -1px;
  width: 105px;
  height: 36px;
  box-sizing: border-box;
  background-color: #67410d;
  border: 1px solid #8d570d;
  border-radius: 0;
  font-size: 14px;
  color: #cdcdcd;
}

.save-cnt {
  width: 87px;
}

.paid-btn {
  display: inline-flex;
  box-sizing: border-box;
  width: 100%;
  height: 38px;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  -webkit-user-select: none;
  -moz-user-select: none;
  user-select: none;
  background-color: #064373;
  border: 1px solid #1368aa;
  font-size: 14px;
  color: #cdcdcd;
}

.undo-link {
  font-size: 14px;
  color: #686868;
  text-decoration: none;
}

.undo-cnt {
  width: 100%;
  text-align: center;
}

.undo-link:hover {
  text-decoration: underline;
  cursor: pointer;
}
</style>
