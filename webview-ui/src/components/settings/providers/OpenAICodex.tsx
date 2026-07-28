import React from "react"

import {
	OpenAiCodexServiceTier,
	type ProviderSettings,
	openAiCodexDefaultModelId,
	openAiCodexModels,
} from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	StandardTooltip,
} from "@src/components/ui"
import { vscode } from "@src/utils/vscode"

import { ModelPicker } from "../ModelPicker"
import { OpenAICodexRateLimitDashboard } from "./OpenAICodexRateLimitDashboard"

const OPEN_AI_CODEX_SERVICE_TIER_KEY = "openAiCodexServiceTier"

interface OpenAICodexProps {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	simplifySettings?: boolean
	openAiCodexIsAuthenticated?: boolean
}

export const OpenAICodex: React.FC<OpenAICodexProps> = ({
	apiConfiguration,
	setApiConfigurationField,
	simplifySettings,
	openAiCodexIsAuthenticated = false,
}) => {
	const { t } = useAppTranslation()

	return (
		<div className="flex flex-col gap-4">
			{/* Authentication Section */}
			<div className="flex flex-col gap-2">
				{openAiCodexIsAuthenticated ? (
					<div className="flex justify-end">
						<Button
							variant="secondary"
							size="sm"
							onClick={() => vscode.postMessage({ type: "openAiCodexSignOut" })}>
							{t("settings:providers.openAiCodex.signOutButton", {
								defaultValue: "Sign Out",
							})}
						</Button>
					</div>
				) : (
					<Button
						variant="primary"
						onClick={() => vscode.postMessage({ type: "openAiCodexSignIn" })}
						className="w-fit">
						{t("settings:providers.openAiCodex.signInButton", {
							defaultValue: "Sign in to OpenAI Codex",
						})}
					</Button>
				)}
			</div>

			{/* Rate Limit Dashboard - only shown when authenticated */}
			<OpenAICodexRateLimitDashboard isAuthenticated={openAiCodexIsAuthenticated} />

			{/* Model Picker */}
			<ModelPicker
				apiConfiguration={apiConfiguration}
				setApiConfigurationField={setApiConfigurationField}
				defaultModelId={openAiCodexDefaultModelId}
				models={openAiCodexModels}
				modelIdKey="apiModelId"
				serviceName="OpenAI - ChatGPT Plus/Pro"
				serviceUrl="https://chatgpt.com"
				simplifySettings={simplifySettings}
				hidePricing
			/>

			<div className="flex flex-col gap-1" data-testid="openai-codex-service-tier">
				<div className="flex items-center gap-1">
					<label className="block font-medium">{t("settings:openAiCodexSpeed.label")}</label>
					<StandardTooltip content={t("settings:openAiCodexSpeed.tooltip")}>
						<i className="codicon codicon-info text-vscode-descriptionForeground text-xs" />
					</StandardTooltip>
				</div>
				<Select
					value={apiConfiguration[OPEN_AI_CODEX_SERVICE_TIER_KEY] ?? OpenAiCodexServiceTier.Default}
					onValueChange={(value) =>
						setApiConfigurationField(
							OPEN_AI_CODEX_SERVICE_TIER_KEY,
							value as ProviderSettings[typeof OPEN_AI_CODEX_SERVICE_TIER_KEY],
						)
					}>
					<SelectTrigger className="w-full">
						<SelectValue placeholder={t("settings:common.select")} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={OpenAiCodexServiceTier.Default}>
							{t("settings:openAiCodexSpeed.standard")}
						</SelectItem>
						<SelectItem value={OpenAiCodexServiceTier.Priority}>
							{t("settings:openAiCodexSpeed.fast")}
						</SelectItem>
					</SelectContent>
				</Select>
			</div>
		</div>
	)
}
