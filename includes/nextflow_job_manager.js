class NextflowJobManager {
  constructor() {
    // Initialization code for NextflowJobManager with default settings
    this.run_environment = 'local';
    this.ssh_host = null;
    this.job_arguments = '';
    this.job_action = 'run';
    this.temp_dir = '/scratch/'; // Default temporary directory
    this.nextflow_command = '';
    console.log('NextflowJobManager initialized with default settings.');
  }

  newJob(job_name = '', run_environment = 'cluster', ssh_host = null) {
    this.job_name = job_name;
    // Initializes a new job with the specified run environment
    this.run_environment = run_environment; 
    // Resets the command string
    this.job_arguments = '';
    this.ssh_host = ssh_host;
  }


  setJobRunDirectory(run_dir) {
    // Sets the run directory for job execution
    this.run_dir = run_dir;
  }


  setJobOutputDirectory(output_dir) {
    // Sets the output directory for job results
    this.output_dir = output_dir;
  }

  setJobTempDirectory(temp_dir) {
    // Sets the temporary directory for job execution
    this.temp_dir = temp_dir;
  }

  setJobUser(user) {
    // Sets the user for the job submission
    this.job_user = user;
  }

  setJobSlurmHeaders() {
    // Sets SLURM-specific headers for the job submission
    this.slurm_commands = '';
    this.slurm_commands += '#!/bin/bash\n';
    this.slurm_commands += `#SBATCH --job-name=${this.job_name}\n`;
    this.slurm_commands += '#SBATCH -N 1\n';
    this.slurm_commands += '#SBATCH -n 1\n';
    this.slurm_commands += '#SBATCH -c 1\n';
    this.slurm_commands += '#SBATCH --qos=general\n';
    this.slurm_commands += '#SBATCH --partition=general\n';
    this.slurm_commands += '#SBATCH --mail-type=END\n';
    this.slurm_commands += '#SBATCH --mem=10G\n';
    this.slurm_commands += '#SBATCH --mail-user=tg-nginx@cam.uchc.edu\n';
    this.slurm_commands += `#SBATCH -o=${this.output_dir}/${this.job_name}_%j.out\n`;
    this.slurm_commands += `#SBATCH -e=${this.output_dir}/${this.job_name}_%j.err\n`;
    this.slurm_commands += `module load nextflow\n`;
    this.slurm_commands += `mkdir -p ${this.temp_dir}/${this.job_user}/${this.job_name}_$SLURM_JOB_ID\n`;
    this.slurm_commands += `TMPDIR=${this.temp_dir}/${this.job_user}/${this.job_name}_$SLURM_JOB_ID\n`;
    this.slurm_commands += `NXF_TEMP=${this.temp_dir}/${this.job_user}/${this.job_name}_$SLURM_JOB_ID\n`;
    this.slurm_commands += `NXF_WORK=${this.temp_dir}/${this.job_user}/${this.job_name}_$SLURM_JOB_ID\n`;
    this.slurm_commands += `NXF_OPTS='-Xms5G -Xmx9G'\n`;
    this.slurm_commands += `TZ='America/New_York'\n`;
    this.slurm_commands += `cd ${this.run_dir}\n`;
  }

  setJobAction(action) {
    // Sets the action for the job submission
    this.job_action = action;
  }

  // eg. TreeGenes/gwas-pipeline
  setJobNextflowResourceName(resource_name) {
    // Appends the resource name to the command string
    this.resource_name = resource_name;
  }

  addJobArgument(argument, value) {
    // Appends a parameter and its value to the command string
    this.job_arguments += ` ${argument} ${value}`;
  }

  submitJob() {
    // Code to submit a Nextflow job
    if (!this.job_arguments) {
      console.log('No job arguments specified.');
      return false;
    }
    this.nextflow_command = `nextflow ${this.job_action} ${this.resource_name} ${this.job_arguments}`;
    var nextflow_command = this.nextflow_command;
    console.log(`Submitting Nextflow job with command: ${nextflow_command}`);

    // Connect via SSH if ssh_host is specified and run_environment is 'cluster'
    const { exec } = require('child_process');
    if (this.run_environment === 'cluster' && this.ssh_host) {
      var full_commands = `ssh ${this.job_user}@${this.ssh_host} << EOF ${this.slurm_commands} ${nextflow_command}\nEOF\n`;
      console.log(`Full SSH command: ${full_commands}`);
      
      exec(full_commands, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error submitting job: ${error.message}`);
          return;
        }
        if (stderr) {
          console.error(`Job submission stderr: ${stderr}`);
          return;
        }
        console.log(`Job submitted successfully: ${stdout}`);
      });
    } else {
      // Local execution
      exec('cd ' + this.run_dir + ';' + nextflow_command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error submitting job: ${error.message}`);
        }
        if (stderr) {
          console.error(`Job submission stderr: ${stderr}`);
        }
        console.log(`Job submitted successfully: ${stdout}`);
      });
    }
  }

  monitorJob(jobId) {
    // Code to monitor the status of a Nextflow job by its jobId
  }

  cancelJob(jobId) {
    // Code to cancel a running Nextflow job by its jobId
  }
}

module.exports = { NextflowJobManager };