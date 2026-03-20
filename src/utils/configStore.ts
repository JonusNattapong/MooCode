import Conf from "conf";

interface ConfigSchema {
  anthropicModel?: string;
  kiloModel?: string;
  defaultProvider?: string;
  autoApprove?: boolean;
}

const configStore = new Conf<ConfigSchema>({
  projectName: "moocode",
  defaults: {
    defaultProvider: "anthropic",
    autoApprove: false,
  },
});

export default configStore;
