import Ajv, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import definitionSchema from "../../schemas/experiment-definition.schema.json";
import sessionSchema from "../../schemas/session-manifest.schema.json";
import resultSchema from "../../schemas/result-bundle.schema.json";
import type { ExperimentDefinition, ResultBundle, SessionManifest } from "../types";

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true });
addFormats(ajv);

const definitionValidator = ajv.compile(definitionSchema);
const sessionValidator = ajv.compile(sessionSchema);
const resultValidator = ajv.compile(resultSchema);

export interface ValidationResult<T> { valid: boolean; value?: T; errors: string[]; rawErrors?: ErrorObject[] | null }

function run<T>(validator: ValidateFunction, value: T): ValidationResult<T> {
  const valid = validator(value);
  return {
    valid: Boolean(valid),
    value: valid ? value : undefined,
    errors: validator.errors?.map((error) => `${error.instancePath || "/"} ${error.message ?? "校验失败"}`) ?? [],
    rawErrors: validator.errors
  };
}

export function validateDefinition(value: unknown): ValidationResult<ExperimentDefinition> {
  return run(definitionValidator, value as ExperimentDefinition);
}

export function validateSession(value: unknown): ValidationResult<SessionManifest> {
  return run(sessionValidator, value as SessionManifest);
}

export function validateResult(value: unknown): ValidationResult<ResultBundle> {
  return run(resultValidator, value as ResultBundle);
}

export function validateConfig(definition: ExperimentDefinition, config: Record<string, unknown>): ValidationResult<Record<string, unknown>> {
  const validator = ajv.compile(definition.configSchema);
  return run(validator, config);
}

export { definitionSchema, sessionSchema, resultSchema };
