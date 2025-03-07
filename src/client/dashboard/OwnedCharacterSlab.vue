<template>
  <character-slab-frame :character-id="character.id">
    <div class="_owned-character-slab" @mouseleave="onMouseOut">
      <div class="body">
        <div>
          <router-link class="name" :to="'/character/' + character.id">
            {{ character.name }} </router-link
          ><!--
     --><tool-tip
            v-for="icon in statusIcons"
            :key="icon.key"
            class="status-icon"
            :inline="true"
            gravity="top"
          >
            <template #default>
              <img class="status-icon-img" :src="icon.src" />
            </template>
            <template #message>
              <div>
                {{ icon.label }}
              </div>
            </template>
          </tool-tip>
        </div>
        <div class="training-summary">
          <div class="training-track">
            <div
              class="training-progress"
              :style="{ width: progressTrackWidth }"
            />
            <span class="training-label">{{ trainingLabel }}</span>
          </div>
          <span
            v-if="character.skillQueue.queueStatus == 'active'"
            class="training-remaining"
            >{{ skillInTraining?.timeRemaining }}</span
          >
        </div>
        <div class="queue-summary">
          {{ queueLabel }}
        </div>
      </div>
      <div v-if="menuItems.length > 0" class="menu">
        <div class="menu-arrow" @mousedown="menu?.toggle()" />
        <drop-menu
          ref="menu"
          class="menu-body"
          :root-style="{
            position: 'absolute',
            right: '7px',
            top: '18px',
          }"
        >
          <div
            v-for="item in menuItems"
            :key="item.tag"
            class="menu-item"
            @click="onMenuItemClick(item)"
          >
            {{ item.label }}
          </div>
        </drop-menu>
      </div>
      <loading-spinner
        class="working-spinner"
        default-state="hidden"
        size="13px"
        tooltip-gravity="left"
        :promise="promise"
      />
    </div>
    <template #sub-slab-hanger>
      <reauthentication-prompt
        v-if="character.needsReauth"
        :login-params="loginParams"
        :character-name="character.name"
      />
    </template>
  </character-slab-frame>
</template>

<script lang="ts">
import ajaxer from "../shared/ajaxer";

import CharacterSlabFrame from "./CharacterSlabFrame.vue";
import ReauthenticationPrompt from "./ReauthenticationPrompt.vue";
import DropMenu from "../shared/DropMenu.vue";
import LoadingSpinner from "../shared/LoadingSpinner.vue";
import ToolTip from "../shared/ToolTip.vue";

import mainIcon from "./res/main-star.svg";
import opsecIcon from "./res/hidden-icon.svg";
import biomassedIcon from "./res/biomassed.svg";
import warningIcon from "../shared-res/triangle-warning.svg";

interface Icon {
  key: string;
  src: string;
  label: string;
}

import { CORP_DOOMHEIM } from "../../shared/eveConstants";
import {
  CharacterJson,
  Dashboard_GET,
} from "../../shared/route/api/dashboard_GET";
import { Skill, Queue } from "../../shared/types/SkillQueueSummary";

interface MenuItem {
  label: string;
  tag: string;
}

import { defineComponent, PropType, ref } from "vue";
export default defineComponent({
  components: {
    CharacterSlabFrame,
    ReauthenticationPrompt,
    DropMenu,
    LoadingSpinner,
    ToolTip,
  },

  props: {
    accountId: { type: Number, required: true },
    character: { type: Object as PropType<CharacterJson>, required: true },
    isMain: { type: Boolean, required: true },
    highlightMain: { type: Boolean, required: true },
    loginParams: { type: String, required: true },
    access: {
      type: Object as PropType<Dashboard_GET["access"]>,
      required: true,
    },
  },

  emits: ["requireRefresh"],

  setup: () => {
    const menu = ref<InstanceType<typeof DropMenu>>();
    return { menu };
  },

  data() {
    return {
      promise: null,
    } as {
      promise: Promise<any> | null;
    };
  },

  computed: {
    biomassed(): boolean {
      return this.character.corpId == CORP_DOOMHEIM;
    },

    skillInTraining(): Skill | null {
      return this.character.skillQueue.skillInTraining;
    },

    queue(): Queue {
      return this.character.skillQueue.queue;
    },

    trainingLabel(): string {
      if (
        this.character.skillQueue.queueStatus == "empty" ||
        !this.skillInTraining
      ) {
        return "Skill queue empty";
      } else if (this.character.skillQueue.queueStatus == "paused") {
        return "Skill queue paused";
      } else {
        return this.skillInTraining.name;
      }
    },

    queueLabel(): string {
      switch (this.character.skillQueue.queueStatus) {
        case "active":
          return (
            `${this.queue.timeRemaining} in queue` +
            ` (${this.queue.count} skills)`
          );
        case "paused":
          return `${this.queue.count} skills in queue`;
        case "empty":
        default:
          return "";
      }
    },

    progressTrackWidth(): string {
      if (
        !this.skillInTraining ||
        this.character.skillQueue.queueStatus != "active"
      ) {
        return "0";
      } else {
        return this.skillInTraining.progress * 100 + "%";
      }
    },

    statusIcons(): Icon[] {
      let icons: Icon[] = [];

      if (this.isMain && this.highlightMain) {
        icons.push({
          key: "main",
          src: mainIcon,
          label: "This is your main character.",
        });
      }

      if (this.character.opsec) {
        icons.push({
          key: "opsec",
          src: opsecIcon,
          label:
            "The fact that you own this character is hidden." +
            " Only members with opsec access can see it.",
        });
      }

      if (this.biomassed) {
        icons.push({
          key: "biomassed",
          src: biomassedIcon,
          label:
            "This character may have been biomassed." +
            " You can delete it from the dropdown menu.",
        });
      }

      const queueWarning = this.character.skillQueue.warning;
      if (queueWarning) {
        icons.push({
          key: "esi-failure",
          src: warningIcon,
          label: getQueueWarningLabel(queueWarning),
        });
      }

      return icons;
    },

    menuItems(): MenuItem[] {
      let items: MenuItem[] = [];
      if (!this.isMain && this.access.designateMain == 2 && !this.biomassed) {
        items.push({
          tag: "designate-main",
          label: "Designate as main",
        });
      }
      if (
        this.access.isMember &&
        !this.isMain &&
        this.character.corpStatus == "external"
      ) {
        items.push({
          tag: "toggle-opsec",
          label: this.character.opsec
            ? "Show in roster"
            : "Don't show in roster",
        });
      }
      if (this.biomassed && !this.isMain) {
        items.push({
          tag: "delete-char",
          label: "Delete biomassed character",
        });
      }

      return items;
    },
  },

  methods: {
    onMouseOut() {
      this.menu?.hide();
    },

    onMenuItemClick(menuItem: MenuItem) {
      this.menu?.hide();
      switch (menuItem.tag) {
        case "designate-main":
          this.designateAsMain();
          break;
        case "toggle-opsec":
          this.toggleOpsec();
          break;
        case "delete-char":
          this.markDeleted();
          break;
      }
    },

    designateAsMain() {
      const promise = ajaxer.putAccountMainCharacter(
        this.accountId,
        this.character.id
      );
      this.promise = promise;
      promise.then(() => {
        this.$emit("requireRefresh", this.character.id);
      });
    },

    toggleOpsec() {
      const promise = ajaxer.putCharacterIsOpsec(
        this.character.id,
        !this.character.opsec
      );
      this.promise = promise;
      promise.then(() => {
        this.$emit("requireRefresh", this.character.id);
      });
    },

    markDeleted() {
      const promise = ajaxer.deleteBiomassedCharacter(this.character.id);
      this.promise = promise;
      promise.then(() => {
        this.$emit("requireRefresh", this.character.id);
      });
    },
  },
});

function getQueueWarningLabel(warning: string): string {
  let generalWarning = "Skill queue may be out of date.";

  switch (warning) {
    case "bad_credentials":
      return `This character's auth tokens may have expired. ` + generalWarning;
    case "fetch_failure":
      return `There was an error when talking to CCP. ` + generalWarning;
    default:
      return generalWarning;
  }
}
</script>

<style scoped>
.body {
  padding: 11px 10px 0 10px;
}

.name {
  font-size: 16px;
  color: #cdcdcd;
  text-decoration: none;
  margin-right: 5px;
}

.name:hover {
  text-decoration: underline;
}

.name:active {
  color: #aaa;
}

.main-marker {
  width: 12px;
  height: 12px;
  margin-left: 2px;
  position: relative;
  top: -1px;
}

.status-icon {
  position: relative;
  top: 1px;
  padding: 2px;
  margin-right: 2px;
  border-radius: 3px;
}

.status-icon:hover {
  background-color: #1b1b1b;
}

.status-icon-img {
  width: 14px;
  height: 14px;
}

.training-summary {
  font-size: 14px;
  font-weight: 300;
}

.training-track {
  position: relative;
  display: inline-block;
  width: 300px;
  height: 22px;
  margin: 12px 0 11px 0;
  padding-top: 5px;
  background: #26221e;
}

.training-progress {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 100%;
  background: linear-gradient(to bottom, #75615c 0%, #534539 50%, #534539 50%);
  transition: width 750ms cubic-bezier(0.645, 0.045, 0.355, 1);
}

.training-label {
  margin-left: 6px;
  position: relative;
}

.training-remaining {
  margin-left: 6px;
}

.queue-summary,
.training-remaining {
  font-size: 12px;
  color: #a7a29c;
}

.menu {
  display: inline-block;
  position: absolute;
  right: 0;
  top: 0;
  opacity: 0;
  transition: opacity 250ms cubic-bezier(0.215, 0.61, 0.355, 1);
}

._owned-character-slab:hover > .menu {
  opacity: 1;
}

.menu-arrow {
  width: 25px;
  height: 22px;
  background-image: url("./res/character-menu-arrow.png");
  background-size: cover;
}

.menu-arrow:hover {
  background-position: 0 100%;
}

.menu-item {
  font-size: 14px;
  font-weight: 300;
  padding: 8px 11px;
  white-space: nowrap;
}

.menu-item:hover {
  background: #4b4b4b;
}

.working-spinner {
  position: absolute;
  right: 24px;
  top: 4px;
}
</style>
