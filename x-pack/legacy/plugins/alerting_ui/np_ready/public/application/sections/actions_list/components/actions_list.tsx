/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React, { Fragment, useState, useEffect } from 'react';
import { EuiInMemoryTable, EuiSpacer, EuiButton } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n/react';
import { ActionsContext } from '../../../context/actions_context';
import { useAppDependencies } from '../../../index';
import { deleteActions, loadAllActions, loadActionTypes } from '../../../lib/api';
import { Action, ActionTableItem, ActionTypeIndex } from '../../../../types';
import { ActionAddFlyout } from '../../action_add';

export const ActionsList: React.FunctionComponent = () => {
  const {
    core: { http },
    actionTypeRegistry,
    plugins: { capabilities, toastNotifications },
  } = useAppDependencies();
  const canDelete = capabilities.get().actions.delete;

  const [actionTypesIndex, setActionTypesIndex] = useState<ActionTypeIndex | undefined>(undefined);
  const [actions, setActions] = useState<Action[]>([]);
  const [data, setData] = useState<ActionTableItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<ActionTableItem[]>([]);
  const [isLoadingActionTypes, setIsLoadingActionTypes] = useState<boolean>(false);
  const [isLoadingActions, setIsLoadingActions] = useState<boolean>(false);
  const [isDeletingActions, setIsDeletingActions] = useState<boolean>(false);
  const [flyoutVisible, setFlyoutVisibility] = useState<boolean>(false);

  useEffect(() => {
    loadActions();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setIsLoadingActionTypes(true);
        const actionTypes = await loadActionTypes({ http });
        const index: ActionTypeIndex = {};
        for (const actionTypeItem of actionTypes) {
          index[actionTypeItem.id] = actionTypeItem;
        }
        setActionTypesIndex(index);
      } catch (e) {
        toastNotifications.addDanger({
          title: i18n.translate(
            'xpack.alertingUI.sections.actionsList.unableToLoadActionTypesMessage',
            { defaultMessage: 'Unable to load action types' }
          ),
        });
      } finally {
        setIsLoadingActionTypes(false);
      }
    })();
  }, []);

  useEffect(() => {
    // Avoid flickering before action types load
    if (typeof actionTypesIndex === 'undefined') {
      return;
    }
    const updatedData = actions.map(action => {
      return {
        ...action,
        actionType: actionTypesIndex[action.actionTypeId]
          ? actionTypesIndex[action.actionTypeId].name
          : action.actionTypeId,
      };
    });
    setData(updatedData);
  }, [actions, actionTypesIndex]);

  async function loadActions() {
    setIsLoadingActions(true);
    try {
      const actionsResponse = await loadAllActions({ http });
      setActions(actionsResponse.data);
    } catch (e) {
      toastNotifications.addDanger({
        title: i18n.translate('xpack.alertingUI.sections.actionsList.unableToLoadActionsMessage', {
          defaultMessage: 'Unable to load actions',
        }),
      });
    } finally {
      setIsLoadingActions(false);
    }
  }

  async function deleteItems(items: ActionTableItem[]) {
    setIsDeletingActions(true);
    const ids = items.map(item => item.id);
    try {
      await deleteActions({ http, ids });
      const updatedActions = actions.filter(action => !ids.includes(action.id));
      setActions(updatedActions);
    } catch (e) {
      toastNotifications.addDanger({
        title: i18n.translate(
          'xpack.alertingUI.sections.actionsList.failedToDeleteActionsMessage',
          { defaultMessage: 'Failed to delete action(s)' }
        ),
      });
      // Refresh the actions from the server, some actions may have beend eleted
      loadActions();
    } finally {
      setIsDeletingActions(false);
    }
  }

  async function deleteSelectedItems() {
    await deleteItems(selectedItems);
  }

  const actionsTableColumns = [
    {
      field: 'actionType',
      name: i18n.translate(
        'xpack.alertingUI.sections.actionsList.actionsListTable.columns.actionType',
        {
          defaultMessage: 'Type',
        }
      ),
      sortable: true,
      truncateText: true,
    },
    {
      field: 'description',
      name: i18n.translate(
        'xpack.alertingUI.sections.actionsList.actionsListTable.columns.description',
        {
          defaultMessage: 'Title',
        }
      ),
      sortable: true,
      truncateText: true,
    },
    {
      name: i18n.translate(
        'xpack.alertingUI.sections.actionsList.actionsListTable.columns.actions',
        { defaultMessage: 'Actions' }
      ),
      actions: [
        {
          enabled: () => canDelete,
          name: i18n.translate(
            'xpack.alertingUI.sections.actionsList.actionsListTable.columns.actions.deleteActionName',
            { defaultMessage: 'Delete' }
          ),
          description: canDelete
            ? i18n.translate(
                'xpack.alertingUI.sections.actionsList.actionsListTable.columns.actions.deleteActionDescription',
                { defaultMessage: 'Delete this action' }
              )
            : i18n.translate(
                'xpack.alertingUI.sections.actionsList.actionsListTable.columns.actions.deleteActionDisabledDescription',
                { defaultMessage: 'Unable to delete actions' }
              ),
          type: 'icon',
          icon: 'trash',
          onClick: (item: ActionTableItem) => deleteItems([item]),
        },
      ],
    },
  ];

  return (
    <section data-test-subj="actionsList">
      <Fragment>
        <EuiSpacer size="m" />
        <ActionsContext.Provider
          value={{
            flyoutVisible,
            setFlyoutVisibility,
            actionTypesIndex,
            loadActions,
          }}
        >
          <EuiInMemoryTable
            loading={isLoadingActions || isLoadingActionTypes || isDeletingActions}
            items={data}
            sorting={true}
            itemId="id"
            columns={actionsTableColumns}
            rowProps={() => ({
              'data-test-subj': 'row',
            })}
            cellProps={() => ({
              'data-test-subj': 'cell',
            })}
            data-test-subj="actionsTable"
            pagination={true}
            selection={{
              onSelectionChange(updatedSelectedItemsList: ActionTableItem[]) {
                setSelectedItems(updatedSelectedItemsList);
              },
            }}
            search={{
              filters: [
                {
                  type: 'field_value_selection',
                  field: 'actionTypeId',
                  name: i18n.translate(
                    'xpack.alertingUI.sections.actionsList.filters.actionTypeIdName',
                    { defaultMessage: 'Type' }
                  ),
                  multiSelect: 'or',
                  options: Object.values(actionTypesIndex || {})
                    .map(actionTypesIndexItem => ({
                      value: actionTypesIndexItem.id,
                      name: actionTypesIndexItem.name,
                    }))
                    .sort((a, b) => a.name.localeCompare(b.name)),
                },
              ],
              toolsRight: [
                <EuiButton
                  key="delete"
                  iconType="trash"
                  color="danger"
                  isDisabled={selectedItems.length === 0 || !canDelete}
                  onClick={deleteSelectedItems}
                  title={
                    canDelete
                      ? undefined
                      : i18n.translate(
                          'xpack.alertingUI.sections.actionsList.buttons.deleteDisabledTitle',
                          { defaultMessage: 'Unable to delete actions' }
                        )
                  }
                >
                  <FormattedMessage
                    id="xpack.alertingUI.sections.actionsList.buttons.deleteLabel"
                    defaultMessage="Delete"
                  />
                </EuiButton>,
                <EuiButton
                  data-test-subj="createActionButton"
                  key="create-action"
                  fill
                  iconType="plusInCircleFilled"
                  iconSide="left"
                  onClick={() => setFlyoutVisibility(true)}
                >
                  <FormattedMessage
                    id="xpack.alertingUI.sections.actionsList.addActionButtonLabel"
                    defaultMessage="Create"
                  />
                </EuiButton>,
              ],
            }}
          />
          <ActionAddFlyout />
        </ActionsContext.Provider>
      </Fragment>
    </section>
  );
};