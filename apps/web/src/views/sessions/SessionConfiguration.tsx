import type {
  ConfiguredHooks,
  ConfiguredTask,
  ParameterUsage,
} from '@deploy-crab/contracts/task-configuration';
import {
  TASK_HOOK_LABELS,
  TASK_HOOK_PHASES,
} from '@deploy-crab/contracts/task';
import { Button, Checkbox, Form, Input, Select, Tag } from 'antd';
import { formatParameterValue } from '../tasks/parameter-editor-model';

export const SessionParameterFields = ({
  usage,
  fields,
  errors,
  onChange,
}: {
  usage: ParameterUsage[];
  fields: Record<string, string>;
  errors: Record<string, string>;
  onChange: (fields: Record<string, string>) => void;
}) => {
  const active = usage.filter((item) => item.active);
  const inactive = usage.filter((item) => !item.active);
  const update = (name: string, value: string | undefined) => {
    const next = { ...fields };
    if (value === undefined) delete next[name];
    else next[name] = value;
    onChange(next);
  };
  return (
    <section
      aria-label="本次执行参数"
      className="rounded-xl border border-sand-4 bg-sand-2 p-4"
    >
      <div className="mb-3 font-medium text-sand-12">
        本次参数{' '}
        <span className="text-xs text-sand-9">{active.length} 个使用中</span>
      </div>
      {!active.length && (
        <p className="text-xs text-sand-9">本次执行无需填写参数。</p>
      )}
      {active.map(({ parameter, consumers, required }) => {
        const { name, type, defaultValue } = parameter;
        const enabled = required || fields[name] !== undefined;
        return (
          <Form.Item
            key={name}
            required={required}
            label={
              <span>
                {parameter.title || name}{' '}
                <code className="text-xs text-sand-9">{name}</code>{' '}
                <Tag color={required ? 'orange' : 'default'}>
                  {required ? '本次必填' : '可选'}
                </Tag>
              </span>
            }
            validateStatus={errors[name] ? 'error' : ''}
            help={errors[name]}
            extra={
              <>
                <span>{parameter.description}</span>
                <div className="mt-1">
                  用于：{consumers.map((consumer) => consumer.title).join('、')}
                </div>
              </>
            }
          >
            {!required && (
              <Checkbox
                className="mb-2"
                checked={enabled}
                onChange={(event) =>
                  update(
                    name,
                    event.target.checked
                      ? defaultValue === undefined
                        ? type === 'boolean'
                          ? 'false'
                          : ''
                        : formatParameterValue(type, defaultValue)
                      : undefined,
                  )
                }
              >
                本次指定
              </Checkbox>
            )}
            {enabled ? (
              type === 'boolean' ? (
                <Select
                  aria-label={`执行参数 ${name}`}
                  value={fields[name] ?? null}
                  options={[
                    { value: 'true', label: '是（true）' },
                    { value: 'false', label: '否（false）' },
                  ]}
                  onChange={(value: string) => update(name, value)}
                />
              ) : type === 'json' ? (
                <Input.TextArea
                  aria-label={`执行参数 ${name}`}
                  value={fields[name] ?? ''}
                  className="font-mono"
                  autoSize={{ minRows: 2, maxRows: 6 }}
                  onChange={(event) => update(name, event.target.value)}
                />
              ) : (
                <Input
                  aria-label={`执行参数 ${name}`}
                  value={fields[name] ?? ''}
                  inputMode={type === 'number' ? 'decimal' : 'text'}
                  onChange={(event) => update(name, event.target.value)}
                />
              )
            ) : (
              <div className="break-all text-xs text-sand-9">
                {defaultValue === undefined
                  ? '未提供；引用处可继续使用子任务默认值。'
                  : `默认：${formatParameterValue(type, defaultValue)}`}
              </div>
            )}
          </Form.Item>
        );
      })}
      {!!inactive.length && (
        <details className="mt-2 text-xs text-sand-9">
          <summary className="cursor-pointer">
            本次未使用 · {inactive.length} 个参数
          </summary>
          <p>
            没有仍会执行的使用方，不校验也不传入；已填写的内容保留，恢复步骤时自动还原。
          </p>
          {inactive.map(({ parameter }) => (
            <Tag key={parameter.name}>{parameter.title || parameter.name}</Tag>
          ))}
        </details>
      )}
      {errors[''] && <p className="text-xs text-red-600">{errors['']}</p>}
    </section>
  );
};

const HookChoices = ({
  hooks,
  disabled,
  skipped,
  onChange,
}: {
  hooks: ConfiguredHooks;
  disabled: boolean;
  skipped: string[];
  onChange: (next: string[]) => void;
}) => (
  <>
    {TASK_HOOK_PHASES.filter((phase) => hooks[phase].length > 0).map(
      (phase) => (
        <details key={phase} className="mt-2 text-xs text-sand-9">
          <summary className="cursor-pointer">
            {TASK_HOOK_LABELS[phase]} · {hooks[phase].length} 个钩子
          </summary>
          {hooks[phase].map((hook) => (
            <div
              key={hook.definition.key}
              className="ml-2 mt-2 border-l border-sand-4 pl-3"
            >
              <span>{hook.definition.title}</span>
              {hook.call.child && (
                <SessionStepChoices
                  configuration={hook.call.child}
                  disabled={disabled}
                  skipped={skipped}
                  onChange={onChange}
                />
              )}
            </div>
          ))}
        </details>
      ),
    )}
  </>
);

export const SessionStepChoices = ({
  configuration,
  disabled = false,
  skipped,
  onChange,
}: {
  configuration: ConfiguredTask;
  disabled?: boolean;
  skipped: string[];
  onChange: (next: string[]) => void;
}) => (
  <div className="flex flex-col gap-2">
    {configuration.steps.map((step, index) => (
      <div
        key={step.path}
        className={`rounded-lg border border-sand-4 p-3 ${step.inactive ? 'bg-sand-2' : 'bg-sand-1'}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={`min-w-0 text-sm ${step.inactive ? 'text-sand-9' : 'text-sand-12'}`}
          >
            {index + 1}. {step.definition.title}
          </span>
          {step.definition.skippable ? (
            <Checkbox
              aria-label={`跳过 ${step.path}`}
              disabled={disabled}
              checked={step.selectedSkip}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...skipped, step.path]
                    : skipped.filter((path) => path !== step.path),
                )
              }
            >
              跳过
            </Checkbox>
          ) : (
            <Tag className="m-0">必做</Tag>
          )}
        </div>
        {!!step.definition.dependsOn.length && (
          <div className="mt-1 text-xs text-sand-9">
            等待：
            {step.definition.dependsOn
              .map(
                (id) =>
                  configuration.steps.find((s) => s.definition.id === id)
                    ?.definition.title ?? id,
              )
              .join('、')}
          </div>
        )}
        {step.call.child && (
          <details className="mt-2" open={step.inactive ? false : undefined}>
            <summary className="cursor-pointer text-xs text-sand-11">
              引用：{step.call.child.task.name} · v
              {step.call.child.task.revision}
            </summary>
            <div className="mt-2 border-l-2 border-sand-4 pl-3">
              <SessionStepChoices
                configuration={step.call.child}
                disabled={disabled || step.inactive}
                skipped={skipped}
                onChange={onChange}
              />
            </div>
          </details>
        )}
        <HookChoices
          hooks={step.hooks}
          disabled={disabled || step.inactive}
          skipped={skipped}
          onChange={onChange}
        />
      </div>
    ))}
    <HookChoices
      hooks={configuration.hooks}
      disabled={disabled}
      skipped={skipped}
      onChange={onChange}
    />
    {!!skipped.length && !configuration.path && (
      <Button
        type="link"
        size="small"
        className="self-start"
        onClick={() => onChange([])}
      >
        恢复所有步骤
      </Button>
    )}
  </div>
);
