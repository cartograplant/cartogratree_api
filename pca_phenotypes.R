args<-commandArgs(TRUE);
args[1] 
# Analysis ID
args[2]

#We read the table containing the phenotypes from the file
#The CSV must have at least 3 columns (1st is the tree id, others are the phenotype data)
csv_data<-read.csv(paste(args[1],'/',args[2],'_pca_phenotypes.csv', sep=""))
#Get column count
column_count<-ncol(csv_data)
#Show head of the data from 1 to column count
head(csv_data[,1:column_count])
# This sets meta rownames (it seems - not entirely sure how to use this)
rownames(csv_data)<-csv_data[,1]
# data_values should contain the phenotype values
# this must be a vector and only occurs if there are multiple columns in the csv_data
data_values<-csv_data[,-1]

#Get rows count
row_count<-nrow(data_values);

#Select the values

data_values_subset<-data_values[c(1:column_count-1)]

#Remove the NAs
data_values_noNA<-na.omit(data_values_subset)

#Code to obtain the principal components (PCs)
data_values_noNA.pca <- prcomp(data_values_noNA, center = TRUE, scale. = TRUE)
summary(data_values_noNA.pca)
str(data_values_noNA.pca)

#install.packages("devtools", repos="https://cloud.r-project.org/")
library(devtools)
#install_github("vqv/ggbiplot")
library(ggbiplot)

p <- ggbiplot(
  data_values_noNA.pca,
  obs.scale = 1,
  var.scale = 1,
  point.size = 2,
  varname.size = 8,
  labels.size = 20,
  varname.color = "black",
  varname.adjust = 1.5,
  var.factor = .8,
  ellipse = FALSE,
  circle = FALSE,
  alpha = 0.3,
  varname.fontface = "bold"
) +
  scale_color_manual(values = "grey90") +
  scale_fill_manual(values = "grey90") +
  labs(
    x = paste0("PC1 (", round(summary(data_values_noNA.pca)$importance[2,1] * 100, 1), "%)"),
    y = paste0("PC2 (", round(summary(data_values_noNA.pca)$importance[2,2] * 100, 1), "%)"),
    title = "Principal Components\nof Selected Traits"
  ) +
  theme_minimal(base_size = 20) +
  theme(
    #panel.grid.major = element_line(color = "gray90", size = 0.3),
    #panel.grid.minor = element_blank(),
    panel.grid = element_blank(),
    panel.background = element_rect(fill = "white", color = NA),
    legend.position = "none",
    axis.title = element_text(size = 20, face = "bold"),
    axis.text = element_text(size = 20),
    plot.title = element_text(size = 30, face = "bold", hjust = 0.5),  # bold title, centered
    plot.margin = margin(5, 5, 5, 5),
    axis.line.x = element_line(color = "black", size = 0.8),
    axis.line.y = element_line(color = "black", size = 0.8)
  ) +
  xlim(-3, 4) +
  ylim(-3, 3)

p

ggsave(
  filename = paste(args[1],'/',args[2],'_pca_phenotypes.png', sep=""),
  plot = p,
  device = "png",
  units = "in",                 # Units must be in inches for ggsave
  width = 8,             # Convert width to inches
  height = 8,           # Convert height to inches
  dpi = 300,         # Use the resolution from command-line options
  limitsize = FALSE             # Allow saving beyond default limits
)


################################################
################################################
## R SESSION INFO                             ##
################################################
################################################


RLogFile <- paste(args[1],'/',args[2],'_phenotypes_R_sessionInfo.csv', sep="")

# Capture both output and errors
sink(RLogFile)
sink(RLogFile, type = "message")  # Capture errors/warnings too

a <- sessionInfo()
print(a)

# Close both sinks
sink(type = "message")
sink()

################################################
################################################
################################################
################################################
