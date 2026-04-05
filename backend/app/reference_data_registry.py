from __future__ import annotations

from dataclasses import dataclass

from app.schemas.reference_data import ReferenceDataFieldRead, ReferenceDataResourceRead


@dataclass(frozen=True)
class ReferenceFieldDefinition:
    key: str
    label: str
    input_type: str = "text"
    required: bool = False
    show_in_list: bool = True
    placeholder: str | None = None
    help_text: str | None = None

    def to_read(self) -> ReferenceDataFieldRead:
        return ReferenceDataFieldRead(
            key=self.key,
            label=self.label,
            input_type=self.input_type,
            required=self.required,
            show_in_list=self.show_in_list,
            placeholder=self.placeholder,
            help_text=self.help_text,
        )


@dataclass(frozen=True)
class ReferenceResourceDefinition:
    key: str
    label: str
    plural_label: str
    description: str
    api_path: str
    settings_path: str
    search_fields: tuple[str, ...]
    fields: tuple[ReferenceFieldDefinition, ...]

    def to_read(self) -> ReferenceDataResourceRead:
        return ReferenceDataResourceRead(
            key=self.key,
            label=self.label,
            plural_label=self.plural_label,
            description=self.description,
            api_path=self.api_path,
            settings_path=self.settings_path,
            search_fields=list(self.search_fields),
            fields=[field.to_read() for field in self.fields],
        )


REFERENCE_DATA_RESOURCES: dict[str, ReferenceResourceDefinition] = {
    "categories": ReferenceResourceDefinition(
        key="categories",
        label="Spending Category",
        plural_label="Spending Categories",
        description="Spending categories for budgeting and reports (e.g. IT Ops, AWS accounts). Separate from service classification.",
        api_path="/api/categories/",
        settings_path="/settings/reference-data/categories",
        search_fields=("name", "description"),
        fields=(
            ReferenceFieldDefinition(
                key="name",
                label="Name",
                required=True,
                placeholder="e.g. IT Ops, AWS Suwali, AWS Check, Organization",
            ),
            ReferenceFieldDefinition(
                key="description",
                label="Description",
                input_type="textarea",
                placeholder="Optional context for when to use this category.",
            ),
        ),
    ),
    "cost-centers": ReferenceResourceDefinition(
        key="cost-centers",
        label="Cost Center",
        plural_label="Cost Centers",
        description="Organizational cost centers used to tag services for budgeting and allocation.",
        api_path="/api/cost-centers/",
        settings_path="/settings/reference-data/cost-centers",
        search_fields=("name", "description"),
        fields=(
            ReferenceFieldDefinition(
                key="name",
                label="Name",
                required=True,
                placeholder="e.g. CC-1000 Engineering",
            ),
            ReferenceFieldDefinition(
                key="description",
                label="Description",
                input_type="textarea",
                placeholder="Optional notes for when to use this cost center.",
            ),
        ),
    ),
    "payment-methods": ReferenceResourceDefinition(
        key="payment-methods",
        label="Payment Method",
        plural_label="Payment Methods",
        description="Track the reusable payment instruments attached to services and cost records.",
        api_path="/api/payment-methods/",
        settings_path="/settings/reference-data/payment-methods",
        search_fields=("name", "method_type", "last_four", "notes"),
        fields=(
            ReferenceFieldDefinition(
                key="name",
                label="Name",
                required=True,
                placeholder="e.g. Corporate Visa",
            ),
            ReferenceFieldDefinition(
                key="method_type",
                label="Method Type",
                placeholder="e.g. credit_card, invoice, ach",
            ),
            ReferenceFieldDefinition(
                key="last_four",
                label="Last Four",
                placeholder="Optional last four digits",
            ),
            ReferenceFieldDefinition(
                key="notes",
                label="Notes",
                input_type="textarea",
                show_in_list=False,
                placeholder="Optional billing or ownership notes.",
            ),
        ),
    ),
    "vendors": ReferenceResourceDefinition(
        key="vendors",
        label="Vendor",
        plural_label="Vendors",
        description="Manage the service vendors referenced by contracts and services.",
        api_path="/api/vendors/",
        settings_path="/settings/reference-data/vendors",
        search_fields=("name", "website", "notes"),
        fields=(
            ReferenceFieldDefinition(
                key="name",
                label="Name",
                required=True,
                placeholder="e.g. Okta, Atlassian, AWS",
            ),
            ReferenceFieldDefinition(
                key="website",
                label="Website",
                input_type="url",
                placeholder="https://vendor.example",
            ),
            ReferenceFieldDefinition(
                key="notes",
                label="Notes",
                input_type="textarea",
                show_in_list=False,
                placeholder="Optional relationship or procurement notes.",
            ),
        ),
    ),
    "login-methods": ReferenceResourceDefinition(
        key="login-methods",
        label="Login Method",
        plural_label="Login Methods",
        description="Define reusable authentication methods connected to service logins.",
        api_path="/api/login-methods/",
        settings_path="/settings/reference-data/login-methods",
        search_fields=("name", "description"),
        fields=(
            ReferenceFieldDefinition(
                key="name",
                label="Name",
                required=True,
                placeholder="e.g. OIDC, SAML, Local account",
            ),
            ReferenceFieldDefinition(
                key="description",
                label="Description",
                input_type="textarea",
                placeholder="Optional notes about how the method is used.",
            ),
        ),
    ),
    "service-statuses": ReferenceResourceDefinition(
        key="service-statuses",
        label="Service Status",
        plural_label="Service Statuses",
        description="Normalize the lifecycle states used by services across forms, lists, and filters.",
        api_path="/api/service-statuses/",
        settings_path="/settings/reference-data/service-statuses",
        search_fields=("name", "description"),
        fields=(
            ReferenceFieldDefinition(
                key="name",
                label="Name",
                required=True,
                placeholder="e.g. Active, Dismissed, Under Review",
            ),
            ReferenceFieldDefinition(
                key="description",
                label="Description",
                input_type="textarea",
                placeholder="Optional guidance for when this status should be applied.",
            ),
        ),
    ),
    "service-classifications": ReferenceResourceDefinition(
        key="service-classifications",
        label="Service Classification",
        plural_label="Service Classifications",
        description="Catalog-wide labels for each service (for example Core SaaS, subscription, or internal). Shown on service records and used in dashboard views.",
        api_path="/api/service-classifications/",
        settings_path="/settings/reference-data/service-classifications",
        search_fields=("slug", "name", "description"),
        fields=(
            ReferenceFieldDefinition(
                key="slug",
                label="Slug",
                required=True,
                placeholder="e.g. core_saas, internal",
                help_text="Stable identifier: lowercase letters, numbers, and underscores only. Used in dashboards and integrations.",
            ),
            ReferenceFieldDefinition(
                key="name",
                label="Display name",
                required=True,
                placeholder="e.g. Core SaaS",
            ),
            ReferenceFieldDefinition(
                key="description",
                label="Description",
                input_type="textarea",
                show_in_list=False,
                placeholder="Optional guidance for when to use this classification.",
            ),
        ),
    ),
}

