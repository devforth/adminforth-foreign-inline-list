import type { 
  AdminForthResource, 
  IAdminForth,
  IHttpServer,
} from "adminforth";
import clone from 'clone';

import { AdminForthPlugin, AdminForthResourcePages, suggestIfTypo } from "adminforth";
import { PluginOptions } from "./types.js";
import { interpretResource, ActionCheckSource } from "adminforth";

export default class ForeignInlineListPlugin extends AdminForthPlugin {
  foreignResource: AdminForthResource;
  options: PluginOptions;
  adminforth: IAdminForth;

  constructor(options: PluginOptions) {
    super(options, import.meta.url);
    this.options = options;
  }

  instanceUniqueRepresentation(pluginOptions: any) : string {
    return `${pluginOptions.foreignResourceId}`;
  }

  setupEndpoints(server: IHttpServer) {
    process.env.HEAVY_DEBUG && console.log(`🪲 ForeignInlineListPlugin.setupEndpoints, registering: '/plugin/${this.pluginInstanceId}/get_resource'`);
    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/get_resource`,
      handler: async ({ body, adminUser }) => {
        const resource = this.adminforth.config.resources.find((res) => this.options.foreignResourceId === res.resourceId);
        if (!resource) {
          return { error: `Resource ${this.options.foreignResourceId} not found` };
        }
        // exclude "plugins" key
        const resourceCopy = clone({ ...resource, plugins: undefined });

        if (this.options.modifyTableResourceConfig) {
          this.options.modifyTableResourceConfig(resourceCopy);
        }

        const { allowedActions } = await interpretResource(adminUser, resourceCopy, {}, ActionCheckSource.DisplayButtons, this.adminforth);

        return { 
          resource: { 
            ...resourceCopy,
            options: {
              ...resourceCopy.options,
              allowedActions,
            },
          }
        };
      }
    });
    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/start_bulk_action`,
      handler: async ({ body, adminUser, tr }) => {
          const { resourceId, actionId, recordIds } = body;
          const resource = this.adminforth.config.resources.find((res) => res.resourceId == resourceId);
          if (!resource) {
              return { error: await tr(`Resource {resourceId} not found`, 'errors', { resourceId }) };
          }

          const resourceCopy = JSON.parse(JSON.stringify({ ...resource, plugins: undefined }));


          if (this.options.modifyTableResourceConfig) {
            this.options.modifyTableResourceConfig(resourceCopy);
          }
          
          const { allowedActions } = await interpretResource(
            adminUser, 
            resourceCopy, 
            { requestBody: body },
            ActionCheckSource.BulkActionRequest,
            this.adminforth
          );

          const action = resourceCopy.options.bulkActions.find((act) => act.id == actionId);
          if (!action) {
            return { error: await tr(`Action {actionId} not found`, 'errors', { actionId }) };
          } 
          
          if (action.allowed) {
            const execAllowed = await action.allowed({ adminUser, resourceCopy, selectedIds: recordIds, allowedActions });
            if (!execAllowed) {
              return { error: await tr(`Action "{actionId}" not allowed`, 'errors', { actionId: action.label }) };
            }
          }
          const response = await action.action({selectedIds: recordIds, adminUser, resourceCopy, tr});
          
          return {
            actionId,
            recordIds,
            resourceId,
            ...response
          }
      }
    })
    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/get_default_filters`,
      handler: async ({body}) => {
        if (!this.options.defaultFilters) {
          return { error: 'No default filters function defined', ok: false };
        }
        const record = body.record;
        if (!record) {
          return { error: 'No record provided in request body', ok: false };
        }
        const filters = this.options.defaultFilters(record);
        if (!Array.isArray(filters)) {
          throw new Error('defauiltFilters must return an array of FilterParams');
        }
        return {ok: true, filters};
      }
    })
  }

  async modifyResourceConfig(adminforth: IAdminForth, resourceConfig: AdminForthResource) {
    super.modifyResourceConfig(adminforth, resourceConfig);
    this.adminforth = adminforth;

    // get resource with foreignResourceId
    this.foreignResource = adminforth.config.resources.find((resource) => resource.resourceId === this.options.foreignResourceId);
    if (!this.foreignResource) {
      const similar = suggestIfTypo(adminforth.config.resources.map((res) => res.resourceId), this.options.foreignResourceId);
      throw new Error(`ForeignInlineListPlugin: Resource with ID "${this.options.foreignResourceId}" not found. ${similar ? `Did you mean "${similar}"?` : ''}`);
    }
    

    const defaultSort = this.foreignResource.options?.defaultSort;
    const newColumn = {
      name: `foreignInlineList_${this.foreignResource.resourceId}`,
      label: 'Foreign Inline List',
      virtual: true,
      showIn: {
        show: true,
        list: false,
        edit: false,
        create: false,
        filter: false,
      },
      components: {
        showRow: { 
          file: this.componentPath('InlineList.vue'),
          meta: {
            defaultFiltersOn: this.options.defaultFilters ? true : false,
            ...this.options, 
            pluginInstanceId: this.pluginInstanceId,
            disableForeignListResourceRefColumn: this.options.disableForeignListResourceRefColumn,
            ...(defaultSort
              ? {
                  defaultSort: {
                    field: defaultSort.columnName,
                    direction: defaultSort.direction,
                  }
                }
              : {}
            )
          }
        }
      },
    };

    if (this.options.placeInGroup?.name) {
      const fieldGroupTypes = [
        'fieldGroups',
        'createFieldGroups', 
        'editFieldGroups',
        'showFieldGroups'
      ] as const;

      let columnAdded = false;
      
      for (const groupType of fieldGroupTypes) {
        const targetGroup = resourceConfig.options?.[groupType]?.find(
          group => group.groupName === this.options.placeInGroup?.name
        );
        
        if (targetGroup) {
          if (this.options.placeInGroup.position < 0 || this.options.placeInGroup.position > targetGroup.columns.length) {
            throw new Error(`ForeignInlineListPlugin: Invalid position ${this.options.placeInGroup?.position}. Must be between 0 and ${targetGroup.columns.length} for group "${this.options.placeInGroup?.name}"`);
          }

          // Only add the column to resourceConfig.columns once
          if (!columnAdded) {
            const beforeColumnName = targetGroup.columns[this.options.placeInGroup.position - 1];
            const beforeColumnIndex = resourceConfig.columns.findIndex(
              col => col.name === beforeColumnName
            );
            resourceConfig.columns.splice(beforeColumnIndex + 1, 0, newColumn);
            columnAdded = true;
          }

          // Add the column name to the group's columns array
          targetGroup.columns.splice(this.options.placeInGroup.position, 0, newColumn.name);
        }
      }
    } else {
      resourceConfig.columns.push(newColumn);
    }
  }
}