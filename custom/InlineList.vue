<template>
  <Teleport to="body">
    <!-- todo exclude foreign column-->
    <Filters
      v-if="filterableColumns.length"
      :columns="filterableColumns"
      :columnsMinMax="columnsMinMax"
      :show="filtersShow"
      @hide="filtersShow = false"
      :filtersStore="filtersStore"
    />
  </Teleport>

  <!-- the list takes the whole row of the show table and sits in the card like a group: a semibold title, the buttons next to it, the table under them -->
  <td colspan="2" class="af-foreign-inline-list block md:table-cell px-5 py-4">
    <div class="flex flex-wrap items-center gap-2 mb-3">
      <h4 v-if="listResource"
        class="af-foreign-inline-list-title me-auto text-sm font-semibold text-lightShowTableHeadingText dark:text-darkShowTableHeadingText"
      >{{ listResource.label }} {{$t('inline records')}}</h4>

      <LinkButton v-if="createIsAllowed"
        :to="{
          name: 'resource-create',
          params: { resourceId: listResource.resourceId },
          query: meta.disableForeignListResourceRefColumn ? {
            returnTo: $route.fullPath,
          } : {
            values: btoa_function(JSON.stringify({[listResourceRefColumn.name]: props.record[selfPrimaryKeyColumn.name]})),
            readonlyColumns: btoa_function(JSON.stringify([listResourceRefColumn.name])),
            returnTo: $route.fullPath,
          },
        }"
        class="af-foreign-inline-list-create-button"
        variant="secondary"
      >
        <IconPlus class="w-4 h-4"/>
        {{$t('Create')}}
      </LinkButton>

      <Button
        v-if="listResource?.options?.allowedActions?.filter"
        class="af-foreign-inline-list-filter-button"
        variant="secondary"
        @click="()=>{filtersShow = !filtersShow}"
      >
        <IconListFilter class="w-4 h-4"/>
        {{$t('Filter')}}
        <span
          v-if="filtersStore.visibleFiltersCount"
          class="inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1 ms-1 rounded-full text-[11px] font-semibold tabular-nums bg-lightPrimary text-lightPrimaryContrast dark:bg-darkPrimary dark:text-darkPrimaryContrast"
        >
          {{ filtersStore.visibleFiltersCount }}
        </span>
      </Button>

      <ThreeDotsMenu
        v-if="listResourceData"
        :threeDotsDropdownItems="listResourceData?.options?.pageInjections?.list?.threeDotsDropdownItems"
        :bulkActions="listResourceData?.bulkActions"
        :checkboxes="checkboxes"
        @startBulkAction="startBulkAction"
        :updateList="getList"
        :clearCheckboxes="clearCheckboxes"
      ></ThreeDotsMenu>
    </div>

    <!-- actions for the checked rows get a row of their own, so the buttons next to the title stay in place -->
    <div v-if="checkboxes.length" class="af-foreign-inline-list-selection flex flex-wrap items-center gap-2 mb-3">
      <Button
        @click="()=>{checkboxes = []}"
        variant="secondary"
        iconOnly
        :aria-label="$t('Remove selection')"
      >
        <Tooltip>
          <IconBan class="w-4 h-4"/>
          <template #tooltip>
            {{$t('Remove selection')}}
          </template>
        </Tooltip>
      </Button>

      <Button
        v-for="action in listResource.options.bulkActions"
        :key="action.id"
        @click="startBulkAction(action.id)"
        :loader="bulkActionLoadingStates[action.id]"
        :class="action.buttonCustomCssClass"
        variant="secondary"
      >
        <component
          v-if="action.icon && !bulkActionLoadingStates[action.id]"
          :is="getIcon(action.icon)"
          class="w-4 h-4 text-lightInputIconColor dark:text-darkInputIconColor"
        />
        {{ `${action.label} (${checkboxes.length})` }}
      </Button>
    </div>

    <!-- a grid item may shrink below the width of the table, so a wide table scrolls inside the card -->
    <div class="grid min-w-0">
      <ResourceListTable
        :resource="listResource"
        :rows="rows"
        @update:page="page = $event"
        @update:sort="sort = $event"
        @update:checkboxes="checkboxes = $event"
        @update:records="getList"

        :page="page"
        :sort="sort"
        :pageSize="pageSize"
        :totalRows="totalRows"
        :checkboxes="checkboxes"
        :isVirtualScrollEnabled="false"
        :customActionsInjection="listResource?.options?.pageInjections?.list?.customActionIcons"
      />
    </div>

  </td>
</template>

<script setup lang="ts">
import { callAdminForthApi } from '@/utils';
import { ref, onMounted, watch, computed, nextTick  } from 'vue';
import ResourceListTable from '@/components/ResourceListTable.vue';
import Filters from '@/components/Filters.vue';
import { Tooltip, Button, LinkButton } from '@/afcl';
import {
  IconBan,
  IconListFilter,
  IconPlus,
} from '@iconify-prerendered/vue-lucide';
import { showErrorTost, showWarningTost } from '@/composables/useFrontendApi';
import { getIcon, btoa_function } from '@/utils';
import { useI18n } from 'vue-i18n';
import ThreeDotsMenu from '@/components/ThreeDotsMenu.vue';
import type { FilterParams } from '@/types/Common';
import { AdminForthFilterOperators } from '@/types/Common';
import type { AdminforthFilterStoreUnwrapped, sortType } from '@/spa_types/core';
import { useAdminforth } from '@/adminforth';

const adminforth = useAdminforth();

const listResourceData = ref(null);

const { t } = useI18n();

const props = defineProps(['column', 'record', 'meta', 'resource', 'adminUser']);

const listResource = ref(null);
const loading = ref(true);

const page = ref(1);
const sort = ref([]);
const checkboxes = ref([]);
const pageSize = computed(() => listResource.value?.options?.listPageSize || 10);

const rows = ref(null);
const totalRows = ref(0);

// local filters source for the inline list filter store
const filters = ref<FilterParams[]>([]);

const shouldFilterBeHidden = (fieldName: string): boolean => {
  if (listResource.value?.columns) {
    const column = listResource.value.columns.find((col: any) => col.name === fieldName);
    if (column?.showIn?.filter !== true) {
      return true;
    }
  }
  return false;
}


const filtersStore: AdminforthFilterStoreUnwrapped = {
  // Expose filters as a getter/setter that directly proxies the local `filters` ref.
  // This allows usage patterns like `filtersStore.filters = []` and `filtersStore.filters.push(...)`
  // while keeping reactivity and the ref as the single source of truth.
  get filters(): FilterParams[] {
    return filters.value;
  },
  set filters(val: FilterParams[]) {
    filters.value = val;
  },

  setSort: (s: sortType) => {
    try {
      // @ts-ignore - update local `sort` if available
      if (typeof sort !== 'undefined' && 'value' in sort) sort.value = s as any;
    } catch (e) {
    }
  },
  getSort: (): sortType => {
    try {
      // @ts-ignore
      return (typeof sort !== 'undefined' && 'value' in sort) ? sort.value as sortType : null;
    } catch (e) {
      return null;
    }
  },

  setFilter: (filter: FilterParams) => {
    filters.value.push(filter);
  },

  setFilters: (f: FilterParams[]) => {
    // console.log('Setting filters', f);
    filters.value = f || [];
  },

  getFilters: (): FilterParams[] => {
    return filters.value;
  },

  clearFilter: (fieldName: string): void => {
    filters.value = filters.value.filter(f => f.field !== fieldName);
  },

  clearFilters: (): void => {
    filters.value = [];
  },

  shouldFilterBeHidden: (fieldName: string): boolean => {
    return shouldFilterBeHidden(fieldName);
  },

  // Unwrapped store expects a plain number here, so we expose it as a getter.
  get visibleFiltersCount(): number {
    return filters.value.filter(f => !shouldFilterBeHidden(f.field)).length;
  },
};
const filtersShow = ref(false);
const columnsMinMax = ref(null);

const defaultFilters = ref([]);

const listResourceRefColumn = computed(() => {
  if (!listResource.value || props.meta.disableForeignListResourceRefColumn) {
    return null;
  }
  return listResource.value.columns.find(c => c.foreignResource?.polymorphicResources
    ? c.foreignResource.polymorphicResources.find((pr) => pr.resourceId === props.resource.resourceId)
    : c.foreignResource?.resourceId === props.resource.resourceId);
});

const selfPrimaryKeyColumn = computed(() => {
  return props.resource.columns.find(c => c.primaryKey);
});

const filterableColumns = computed(() => {
  if (!listResource.value) {
    return [];
  }

  if (props.meta.disableForeignListResourceRefColumn) {
    return listResource.value.columns.filter((c) => c.showIn.filter === true);
  }

  const refColumn = listResourceRefColumn.value;
  return listResource.value.columns.filter((c) => c.name !== refColumn.name
    && (refColumn.foreignResource.polymorphicOn ? c.name !== refColumn.foreignResource.polymorphicOn : true));
});

const endFilters = computed(() => {
  if (!listResource.value) {
    return [];
  }
  if (props.meta.disableForeignListResourceRefColumn) {
    return [
      ...defaultFilters.value,
      ...filters.value,
    ];
  }
  // get name of the column that is foreign key
  const refColumn = listResourceRefColumn.value;

  const primaryKeyColumn = selfPrimaryKeyColumn.value;

  if (!refColumn) {
    showErrorTost(t('Column with foreignResource.resourceId which is equal to {resourceId} not found in resource which is specified as foreignResourceId {foreignResourceId}', {
      resourceId: props.resource.resourceId,
      foreignResourceId: listResource.value.resourceId
    }), 10000);
    return [];
  }

  let primaryKeyValue = null;
  if (primaryKeyColumn.foreignResource) {
    primaryKeyValue = props.record[primaryKeyColumn.name].pk;
  } else {
    primaryKeyValue = props.record[primaryKeyColumn.name];
  }
  const toReturn = [
    ...defaultFilters.value,
    ...filters.value
  ];
  if (primaryKeyValue !== null && primaryKeyValue !== undefined) {
    toReturn.push({
      field: refColumn.name,
      operator: AdminForthFilterOperators.EQ,
      value: primaryKeyValue,
    });
  }
  return toReturn;
});

const createIsAllowed = computed(() => {
  if (!listResource.value?.options?.allowedActions?.create) {
    return false;
  }

  if (listResourceRefColumn.value && !listResourceRefColumn.value.showIn.create) {
    return false;
  }
  return true;
});

watch([page], async () => {
  await getList();
});

watch([sort], async () => {
  await getList();
}, {deep: true});

watch([filters], async () => {
  page.value = 1;
  checkboxes.value = [];
  await getList();
}, {deep: true});

const bulkActionLoadingStates = ref({});

async function startBulkAction(actionId) {
  const action = listResource.value.options.bulkActions.find(a => a.id === actionId);
  if (action.confirm) {
    const confirmed = await adminforth.confirm(
      typeof action.confirm === 'string'
        ? { title: action.confirm, dangerous: true }
        : {
            ...action.confirm,
            message: action.confirm.message && t(action.confirm.message, { count: checkboxes.value.length }),
            dangerous: true,
          }
    );
    if (!confirmed) {
      return;
    }
  }
  bulkActionLoadingStates.value[actionId] = true;

  const data = await callAdminForthApi({
    path: `/plugin/${props.meta.pluginInstanceId}/start_bulk_action`,
    method: 'POST',
    body: {
      actionId: actionId,
      recordIds: checkboxes.value
    }
  });
  bulkActionLoadingStates.value[actionId] = false;
  
  if (data?.ok) {
    checkboxes.value = [];
    await getList();

    if (data.successMessage) {
      adminforth.alert({
        message: data.successMessage,
        variant: 'success'
      });
    }
  }
  if (data?.error) {
    showErrorTost(data.error);
  }
}

async function getList() {
  rows.value = null;
  if( !listResource.value ){
    return;
  }
  console.log('Getting list for resource', 'with filters', endFilters.value, 'and sort', sort.value);
  const data = await callAdminForthApi({
    path: '/get_resource_data',
    method: 'POST',
    body: {
      source: 'list',
      resourceId: listResource.value.resourceId,
      limit: pageSize.value,
      offset: (page.value - 1) * pageSize.value,
      filters: endFilters.value,
      sort: sort.value,
    }
  });

  if (data.error) {
    showErrorTost(data.error);
    rows.value = [];
    totalRows.value = 0;
    return;
  }
  listResourceData.value = data;
  rows.value = data.data?.map(row => {
    row._primaryKeyValue = row[listResource.value.columns.find(c => c.primaryKey).name];
    return row;
  });
  totalRows.value = data.total;

  await nextTick();
}

async function getDefaultFilters() {
  const data = await callAdminForthApi({
    path: `/plugin/${props.meta.pluginInstanceId}/get_default_filters`,
    method: 'POST',
    body: {
      record: props.record,
    },
  });
  if (data.ok) {
    defaultFilters.value = data.filters;
  } else {
    showErrorTost(data.error);
  }
}

onMounted( async () => {
  loading.value = true;
  if (props.meta?.defaultSort && sort.value.length === 0) {
    sort.value = [props.meta.defaultSort];
  }
  const foreighResourceId = props.meta.foreignResourceId;
  listResource.value = (await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/get_resource`,
      method: 'POST',
      body: {},
  })).resource;

  if (listResource.value?.options?.allowedActions?.create && listResourceRefColumn.value && !listResourceRefColumn.value.showIn.create) {
    showWarningTost(t(`Resource '${listResource.value.resourceId}' column '${listResourceRefColumn.value.name}' should be editable on create page for 'create' action to be enabled`));
  }
  
  columnsMinMax.value = await callAdminForthApi({
    path: '/get_min_max_for_columns',
    method: 'POST',
    body: {
      resourceId: foreighResourceId,
    }
  });
  loading.value = false;
  if (props.meta.defaultFiltersOn) {
    await getDefaultFilters();
  }
  
  await getList();

});

function clearCheckboxes() {
  checkboxes.value = [];
}


</script>