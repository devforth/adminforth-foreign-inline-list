<template>
  <Teleport to="body">
    <!-- todo exclude foreign column-->
    <Filters
      v-if="filterableColumns.length"
      :columns="filterableColumns"
      v-model:filters="filters"
      :columnsMinMax="columnsMinMax"
      :show="filtersShow"
      @hide="filtersShow = false"
    />
  </Teleport>
    
  <td colspan="2" class="pb-3 px-0 pt-0">
    <div class="flex items-center gap-1">
      <h4 v-if="listResource"
          class="px-6 py-4"
      >{{ listResource.label }} {{$t('inline records')}}</h4>

      <button
        @click="()=>{checkboxes = []}"
        v-if="checkboxes.length"
        data-tooltip-target="tooltip-remove-all"
        data-tooltip-placement="bottom"
        class="flex gap-1  items-center py-1 px-3 me-2 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-default border border-gray-300 hover:bg-gray-100 hover:text-lightPrimary focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700"
      >
        <IconBanOutline class="w-5 h-5 "/>
        <div id="tooltip-remove-all" role="tooltip"
             class="absolute z-10 invisible inline-block px-3 py-2 text-sm font-medium text-white transition-opacity duration-300 bg-gray-900 rounded-lg shadow-sm opacity-0 tooltip dark:bg-gray-700">
          {{$t('Remove selection')}}
          <div class="tooltip-arrow" data-popper-arrow></div>
        </div>
      </button>

      <button
        v-if="checkboxes.length" 
        v-for="(action,i) in listResource?.options?.bulkActions" 
        :key="action.id"
        @click="startBulkAction(action.id)"
        class="flex gap-1 items-center py-1 px-3 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-default border border-gray-300 hover:bg-gray-100 hover:text-lightPrimary focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700"
        :class="{
          'bg-red-100 text-red-800 border-red-400 dark:bg-red-700 dark:text-red-400 dark:border-red-400': action.state==='danger', 
          'bg-green-100 text-green-800 border-green-400 dark:bg-green-700 dark:text-green-400 dark:border-green-400':action.state==='success',
          'bg-lightPrimaryOpacity text-lightPrimary border-blue-400 dark:bg-blue-700 dark:text-blue-400 dark:border-blue-400':action.state==='active',
        }"
      >
        <component
          v-if="action.icon && !bulkActionLoadingStates[action.id]"
          :is="getIcon(action.icon)"
          class="w-5 h-5 text-gray-500 transition duration-75 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white">
        </component>
        <div v-if="bulkActionLoadingStates[action.id]">
          <svg 
            aria-hidden="true" 
            class="w-5 h-5 animate-spin" 
            :class="{
              'text-gray-200 dark:text-gray-500 fill-gray-500 dark:fill-gray-300': action.state !== 'danger',
              'text-red-200 dark:text-red-800 fill-red-600 dark:fill-red-500': action.state === 'danger'
            }"
            viewBox="0 0 100 101" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor"/>
            <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentFill"/>
          </svg>
          <span class="sr-only">{{$t('Loading...')}}</span>
        </div>

        {{ `${action.label} (${checkboxes.length})` }}
      </button>
      <RouterLink v-if="createIsAllowed"
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
        class="flex items-center py-1 px-3 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded border border-gray-300 hover:bg-gray-100 hover:text-lightPrimary focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700 rounded-default gap-1"
      >
        <IconPlusOutline class="w-4 h-4"/>
        {{$t('Create')}}
      </RouterLink>

      <button
        v-if="listResource?.options?.allowedActions?.filter"
        class="flex gap-1 items-center py-1 px-3 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded border border-gray-300 hover:bg-gray-100 hover:text-lightPrimary focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700 rounded-default"
        @click="()=>{filtersShow = !filtersShow}"
      >
        <IconFilterOutline class="w-4 h-4"/>
        {{$t('Filter')}}
        <span
          class="bg-red-100 text-red-800 text-xs font-medium  px-2.5 py-0.5 rounded dark:bg-gray-700 dark:text-red-400 border border-red-400"
          v-if="filters.length">
            {{ filters.length }}
          </span>
      </button>

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

    <ResourceListTable
      :noRoundings="true"
      :resource="listResource"
      :rows="rows"
      @update:page="page = $event"
      @update:sort="sort = $event"
      @update:checkboxes="checkboxes = $event"
      @update:records="getList"

      :sort="sort"
      :pageSize="pageSize"
      :totalRows="totalRows"
      :checkboxes="checkboxes"
      :customActionsInjection="listResource?.options?.pageInjections?.list?.customActionIcons"
    />

  </td>
</template>

<script setup>
import { callAdminForthApi } from '@/utils';
import { ref, onMounted, watch, computed, nextTick  } from 'vue';
import ResourceListTable from '@/components/ResourceListTable.vue';
import Filters from '@/components/Filters.vue';
import {
  IconBanOutline,
  IconFilterOutline,
  IconPlusOutline,
} from '@iconify-prerendered/vue-flowbite';
import { showErrorTost, showWarningTost } from '@/composables/useFrontendApi';
import { getIcon, btoa_function } from '@/utils';
import { useI18n } from 'vue-i18n';
import ThreeDotsMenu from '@/components/ThreeDotsMenu.vue';
import { useFiltersStore } from '@/stores/filters';

const filtersStore = useFiltersStore();

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

const filters = ref([]);
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


  return [
    ...defaultFilters.value,
    ...filters.value,
    {
      field: refColumn.name,
      operator: 'eq',
      value: primaryKeyValue,
    },
  ];
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
    const confirmed = await adminforth.confirm({
      message: action.confirm,
    });
    if (!confirmed) {
      return;
    }
  }
  bulkActionLoadingStates.value[actionId] = true;

  const data = await callAdminForthApi({
    path: `/plugin/start_bulk_action`,
    method: 'POST',
    body: {
      resourceId: listResource.value.resourceId,
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
      path: `/get_resource`,
      method: 'POST',
      body: {
        resourceId: foreighResourceId,
      },
  })).resource;

  if (listResource.value?.options?.allowedActions?.create && listResourceRefColumn.value && !listResourceRefColumn.value.showIn.create) {
    showWarningTost(t(`Resource '${listResource.value.resourceId}' column '${listResourceRefColumn.value.name}' should be editable on create page for 'create' action to be enabled`), 10000);
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
  filtersStore.setFilters(endFilters.value);
});

function clearCheckboxes() {
  checkboxes.value = [];
}


</script>